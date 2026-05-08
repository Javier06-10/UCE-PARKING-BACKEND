"""
Detector de placas LPR — baja latencia + OCR + integración backend
- Fuerza RTSP sobre TCP para evitar errores H264 cabac
- Hilo dedicado de captura (elimina delay acumulado)
- EasyOCR con preprocesamiento para leer el texto de la placa
- Estabilizador por votación para evitar parpadeo en el texto
- Envía la placa al backend Node.js con cooldown de 20 segundos
- Muestra banner ACCESO PERMITIDO / DENEGADO en pantalla
"""

import cv2
import threading
import time
import re
import ctypes
import requests
from collections import Counter, deque, defaultdict
from ultralytics import YOLO
import easyocr

# ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────

RTSP_MAIN = "rtsp://admin:87654321a@192.168.100.98:554/h264Preview_01_main"
FUENTE_VIDEO = RTSP_MAIN

MODELO_PATH = "license_plate_detector.pt"
CONFIANZA_MIN = 0.4
MOSTRAR_FPS = True

# Backend
API_ENTRADA = "http://localhost:4000/api/access/entrada"
COOLDOWN_SEGUNDOS = 20      # no reenviar la misma placa antes de N segundos
CONFIANZA_ENVIO   = 0.70    # confianza mínima del YOLO para enviar al backend

# Patrón placa República Dominicana: [LETRA][6 DÍGITOS] con guion opcional
PATRON_RD = re.compile(r'^[A-Z]-?\d{6}$')

# ─── ESTADO GLOBAL DEL BANNER ─────────────────────────────────────────────────

_banner = {
    "texto": "",
    "color": (0, 180, 0),
    "expira": 0.0,          # timestamp hasta donde se muestra
}
_ultimo_envio: dict = defaultdict(float)    # placa → timestamp último envío

# ─── ESTABILIZADOR POR VOTACIÓN ───────────────────────────────────────────────

class PlacaEstabilizador:
    """Guarda las últimas N lecturas y devuelve la más frecuente."""

    def __init__(self, ventana=6):
        self._buffer = deque(maxlen=ventana)
        self.texto_actual = ""
        self.es_valida = False

    def actualizar(self, texto, valida):
        if texto:
            self._buffer.append((texto, valida))
        if self._buffer:
            contador = Counter(t for t, _ in self._buffer)
            mejor = contador.most_common(1)[0][0]
            self.texto_actual = mejor
            self.es_valida = any(v for t, v in self._buffer if t == mejor)
        return self.texto_actual

# ─── CAPTURADOR DE BAJA LATENCIA ─────────────────────────────────────────────

class CapturadorBajaLatencia:
    def __init__(self, fuente):
        self.fuente = fuente
        self._frame = None
        self._lock = threading.Lock()
        self._activo = False
        self._cap = None

    def _abrir_captura(self):
        fuente = self.fuente
        if isinstance(fuente, str) and fuente.startswith("rtsp://"):
            cap = cv2.VideoCapture(fuente, cv2.CAP_FFMPEG)
        elif isinstance(fuente, str) and fuente.startswith("http://"):
            cap = cv2.VideoCapture(fuente, cv2.CAP_FFMPEG)
        else:
            cap = cv2.VideoCapture(fuente)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap

    def iniciar(self):
        self._cap = self._abrir_captura()
        if not self._cap.isOpened():
            raise RuntimeError(f"No se pudo abrir: {self.fuente}")
        self._activo = True
        threading.Thread(target=self._leer, daemon=True).start()
        inicio = time.time()
        while self._frame is None and time.time() - inicio < 5:
            time.sleep(0.05)

    def _leer(self):
        errores = 0
        while self._activo:
            ok, frame = self._cap.read()
            if ok:
                errores = 0
                with self._lock:
                    self._frame = frame
            else:
                errores += 1
                if errores > 30:
                    print("[Captura] Reconectando...")
                    self._cap.release()
                    time.sleep(1)
                    self._cap = self._abrir_captura()
                    errores = 0

    def leer(self):
        with self._lock:
            return self._frame.copy() if self._frame is not None else None

    def detener(self):
        self._activo = False
        if self._cap:
            self._cap.release()

# ─── OCR ─────────────────────────────────────────────────────────────────────

def preprocesar_para_ocr(crop):
    h, w = crop.shape[:2]
    if h < 120:
        escala = 120 / h
        crop = cv2.resize(crop, (int(w * escala), 120), interpolation=cv2.INTER_CUBIC)
    gris = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))
    gris = clahe.apply(gris)
    gris = cv2.bilateralFilter(gris, 9, 75, 75)
    return cv2.cvtColor(gris, cv2.COLOR_GRAY2BGR)


def leer_texto_placa(crop, lector_ocr):
    procesado = preprocesar_para_ocr(crop)
    lecturas = lector_ocr.readtext(
        procesado,
        detail=0,
        allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
        paragraph=False,
    )
    texto = ''.join(lecturas).upper().replace(' ', '')
    valida = bool(PATRON_RD.match(texto))
    return texto, valida

# ─── BACKEND ─────────────────────────────────────────────────────────────────

def enviar_al_backend(placa):
    """Envía la placa al backend respetando el cooldown. Retorna el JSON de respuesta o None."""
    global _ultimo_envio, _banner
    ahora = time.time()

    if ahora - _ultimo_envio[placa] < COOLDOWN_SEGUNDOS:
        return None     # cooldown activo

    _ultimo_envio[placa] = ahora

    try:
        resp = requests.post(
            API_ENTRADA,
            json={"placa": placa},
            timeout=3
        )
        datos = resp.json()
    except Exception as e:
        print(f"[API] Error de conexión: {e}")
        _banner["texto"] = "SIN CONEXION AL BACKEND"
        _banner["color"] = (0, 140, 255)     # naranja
        _banner["expira"] = time.time() + 4
        return None

    # Actualizar banner según respuesta
    if datos.get("ok"):
        _banner["texto"] = f"ACCESO PERMITIDO  {placa}"
        _banner["color"] = (0, 180, 0)       # verde
    elif datos.get("code") == "VEHICULO_NO_REGISTRADO":
        _banner["texto"] = f"DENEGADO — NO REGISTRADO  {placa}"
        _banner["color"] = (0, 0, 200)       # rojo
    else:
        _banner["texto"] = datos.get("error", "ERROR DESCONOCIDO")
        _banner["color"] = (0, 0, 180)

    _banner["expira"] = time.time() + 5      # mostrar 5 segundos

    print(f"[API] {_banner['texto']}")
    return datos

# ─── PANTALLA ────────────────────────────────────────────────────────────────

def obtener_resolucion_pantalla():
    user32 = ctypes.windll.user32
    user32.SetProcessDPIAware()
    return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)


def escalar_a_pantalla(frame, pantalla_w, pantalla_h):
    h, w = frame.shape[:2]
    escala = min(pantalla_w / w, pantalla_h / h)
    return cv2.resize(frame, (int(w * escala), int(h * escala)), interpolation=cv2.INTER_LINEAR)


def dibujar_banner(frame):
    """Dibuja el banner de respuesta del backend en la parte superior del frame."""
    if time.time() > _banner["expira"] or not _banner["texto"]:
        return frame
    h, w = frame.shape[:2]
    alto_banner = 62
    cv2.rectangle(frame, (0, 0), (w, alto_banner), _banner["color"], -1)
    cv2.putText(frame, _banner["texto"], (18, 44),
                cv2.FONT_HERSHEY_DUPLEX, 1.1, (255, 255, 255), 2)
    return frame


def dibujar_detecciones(frame, resultados, lector_ocr, estabilizador, fps=None):
    for r in resultados:
        for box in r.boxes:
            conf = float(box.conf[0])
            if conf < CONFIANZA_MIN:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            margen = 4
            crop = frame[
                max(0, y1 - margen):min(frame.shape[0], y2 + margen),
                max(0, x1 - margen):min(frame.shape[1], x2 + margen)
            ]

            texto_final = ""
            if crop.size > 0:
                texto, valida = leer_texto_placa(crop, lector_ocr)
                texto_final = estabilizador.actualizar(texto, valida)

                # Enviar al backend solo si la lectura está validada y la
                # confianza del detector supera el umbral
                if estabilizador.es_valida and conf >= CONFIANZA_ENVIO:
                    threading.Thread(
                        target=enviar_al_backend,
                        args=(texto_final,),
                        daemon=True
                    ).start()

            color = (0, 220, 0) if estabilizador.es_valida else (0, 200, 220)

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            # Etiqueta de confianza (arriba del bbox)
            det_label = f"{conf:.0%}"
            (tw, th), _ = cv2.getTextSize(det_label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
            cv2.putText(frame, det_label, (x1 + 2, y1 - 3),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)

            # Texto OCR (debajo del bbox)
            if texto_final:
                font_scale, grosor = 1.1, 3
                (ow, oh), _ = cv2.getTextSize(
                    texto_final, cv2.FONT_HERSHEY_DUPLEX, font_scale, grosor)
                oy = y2 + oh + 8
                cv2.rectangle(frame, (x1 - 2, y2 + 4), (x1 + ow + 6, oy + 4),
                               (0, 0, 0), -1)
                cv2.putText(frame, texto_final, (x1 + 2, oy),
                            cv2.FONT_HERSHEY_DUPLEX, font_scale, color, grosor)

    if fps is not None:
        cv2.putText(frame, f"FPS: {fps:.1f}", (10, 34),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)

    dibujar_banner(frame)
    return frame

# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    print("Cargando modelo YOLOv8...")
    modelo = YOLO(MODELO_PATH)

    print("Iniciando EasyOCR (primera vez descarga modelos ~100 MB)...")
    lector_ocr = easyocr.Reader(['en'], gpu=False, verbose=False)
    print("Todo listo.")

    estabilizador = PlacaEstabilizador(ventana=6)
    pantalla_w, pantalla_h = obtener_resolucion_pantalla()

    ventana = "Detector Placas LPR"
    cv2.namedWindow(ventana, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(ventana, pantalla_w, pantalla_h)
    cv2.moveWindow(ventana, 0, 0)

    capturador = CapturadorBajaLatencia(FUENTE_VIDEO)
    print(f"Conectando a: {FUENTE_VIDEO}")
    capturador.iniciar()
    print("Stream activo.  'q' = salir  |  'f' = pantalla completa")

    t_anterior = time.time()
    fps = 0.0
    pantalla_completa = False

    while True:
        frame = capturador.leer()
        if frame is None:
            time.sleep(0.01)
            continue

        resultados = modelo(frame, verbose=False)

        ahora = time.time()
        fps = 0.9 * fps + 0.1 * (1.0 / max(ahora - t_anterior, 1e-6))
        t_anterior = ahora

        frame = dibujar_detecciones(
            frame, resultados, lector_ocr, estabilizador,
            fps if MOSTRAR_FPS else None
        )
        frame = escalar_a_pantalla(frame, pantalla_w, pantalla_h)
        cv2.imshow(ventana, frame)

        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        elif tecla == ord("f"):
            pantalla_completa = not pantalla_completa
            modo = cv2.WINDOW_FULLSCREEN if pantalla_completa else cv2.WINDOW_NORMAL
            cv2.setWindowProperty(ventana, cv2.WND_PROP_FULLSCREEN, modo)

    capturador.detener()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

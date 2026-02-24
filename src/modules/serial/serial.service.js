
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { updatePlazas } from '../parking/parking.service.js';

let port;
let parser;
let lastNormal = -1;
let lastVip = -1;

function initSerial() {

  port = new SerialPort({
    path: process.env.SERIAL_PORT,
    baudRate: 9600,
  });

  parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  parser.on('data', handleSerialData);

  port.on('open', () => {
    console.log('🔌 Serial conectado');
  });

  port.on('error', (err) => {
    console.error('❌ Serial error:', err.message);
  });
}

function handleSerialData(data) {

  
  try {
    const json = JSON.parse(data);

    if (json.type === 'plaza_update') {
   updatePlazas(json.plazas);
   if (global.io) {
    global.io.emit('plaza_update', {
      normal: json.plazas.filter(p => !p.vip && p.occupied).length,
      vip: json.plazas.filter(p => p.vip && p.occupied).length,
    });
   }
}

    if (json.type === 'parking_update') {
      handleParkingUpdate(json);
    }

    if (json.type === 'gate_event') {
      handleGateEvent(json);
    }

  } catch (err) {
    console.log('Dato no JSON:', data);
  }
}

async function handleParkingUpdate(data) {

  if (data.normal === lastNormal && data.vip === lastVip)
    return;

  lastNormal = data.normal;
  lastVip = data.vip;

  await updateParkingCounts(data.normal, data.vip);
}

function handleGateEvent(data) {
  console.log('🚪 Evento puerta:', data);
}
function sendCommand(command) {

  if (!port || !port.isOpen) {
    throw new Error("Serial no conectado");
  }

  const json = JSON.stringify({ command });
  port.write(json + '\n');
}


export { initSerial, sendCommand };
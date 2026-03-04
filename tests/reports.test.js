import { guardarReporte } from "../src/modules/reports/reports.services.js";
import supabase from "../src/config/supabase.js";

// Mock Supabase
jest.mock("../src/config/supabase.js", () => {
  return {
    default: {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { message: "Report saved structure" }, error: null }),
    }
  };
});

describe("Reports Service - guardarReporte", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should truncate long description over 250 characters", async () => {
    const longDesc = "A".repeat(300);
    const mockData = { some: "data" };

    await guardarReporte({
      tipo: "GENERAL",
      descripcion: longDesc,
      datos: mockData,
      personaId: 1
    });

    const insertCall = supabase.from().insert.mock.calls[0][0];
    expect(insertCall.Descripcion.length).toBeLessThanOrEqual(250);
    expect(insertCall.Descripcion).toBe("A".repeat(250));
  });

  it("should truncate JSON data representation if it exceeds 250 characters", async () => {
    const hugeArray = Array.from({ length: 100 }, (_, i) => ({ id: i, value: "something long enough to trigger limit" }));
    const mockData = { array: hugeArray };
    
    // Original JSON string would be thousands of chars
    const fullLength = JSON.stringify(mockData).length;
    expect(fullLength).toBeGreaterThan(250);

    await guardarReporte({
      tipo: "GENERAL",
      descripcion: "Test",
      datos: mockData,
      personaId: 1
    });

    const insertCall = supabase.from().insert.mock.calls[0][0];
    
    // The truncated payload structure should include the 'resumen' warning key
    const parsedPayload = JSON.parse(insertCall.Datos_Adjuntos_Ruta);
    expect(parsedPayload.resumen).toBe("Data truncada por limite de bd");
    expect(insertCall.Datos_Adjuntos_Ruta.length).toBeLessThan(250);
  });
});

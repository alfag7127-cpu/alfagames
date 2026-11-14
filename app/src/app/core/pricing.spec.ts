import { calcularCobro, precioGta6, redondearHoras } from './pricing';

// Casos de la tabla de ejemplos del negocio (docs/PLAN.md "Estándar de cobro").
// Deben coincidir con private.calcular_cobro en Supabase.
describe('calcularCobro', () => {
  const casos: [string, number, number[], number][] = [
    ['1h', 60, [], 6000],
    ['2h', 120, [], 10000],
    ['3h', 180, [], 15000],
    ['4h', 240, [], 20000],
    ['5h', 300, [], 25000],
    ['6h', 360, [], 30000],
    ['1h con 3 controles', 60, [60], 8000],
    ['1h con 4 controles', 60, [60, 60], 10000],
    ['2h con 3 controles', 120, [120], 16000],
    ['2h con 4 controles', 120, [120, 120], 20000],
    ['1h30 con 3 controles', 90, [90], 12000],
    ['1h30 con 4 controles', 90, [90, 90], 15000],
    ['3h con 3 controles', 180, [180], 24000],
    ['2h30 sin controles', 150, [], 12500],
    ['1h05 redondea a 1h', 65, [], 6000],
    ['1h16 redondea a 1h30', 76, [], 9000],
    ['10 min cobra el mínimo de 30 min', 10, [], 3000],
    ['2h, control entra al cumplir 1h', 120, [60], 14000],
    ['control usado 10 min no se cobra y mantiene paquete', 120, [10], 10000],
  ];

  for (const [nombre, minutos, controles, esperado] of casos) {
    it(nombre, () => {
      expect(calcularCobro(minutos, controles).precioTotal).toBe(esperado);
    });
  }

  it('precio manual reemplaza el base y los controles se suman aparte', () => {
    expect(calcularCobro(120, [120], 5000).precioTotal).toBe(5000 + 2000 * 2);
  });
});

describe('redondearHoras', () => {
  it('redondea a la media hora más cercana y sube en empate', () => {
    expect(redondearHoras(74)).toBe(1);
    expect(redondearHoras(75)).toBe(1.5);
    expect(redondearHoras(104)).toBe(1.5);
    expect(redondearHoras(105)).toBe(2);
  });
});

describe('precioGta6', () => {
  const tabla = [
    { minutos: 60, precio: 6000 },
    { minutos: 120, precio: 20000 },
    { minutos: 360, precio: 30000 },
  ];

  it('usa el precio de la tabla, interpola entre tiempos y es proporcional fuera de la tabla (igual que el servidor)', () => {
    expect(precioGta6(1, tabla)).toBe(6000);
    expect(precioGta6(2, tabla)).toBe(20000);
    expect(precioGta6(1.5, tabla)).toBe(13000);
    expect(precioGta6(0.5, tabla)).toBe(3000);
    expect(precioGta6(7, tabla)).toBe(35000);
  });

  it('sin precios GTA 6 devuelve null', () => {
    expect(precioGta6(1, [])).toBeNull();
  });
});

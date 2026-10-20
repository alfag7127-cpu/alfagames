import { repartirPago } from './pago-potes';

describe('repartirPago', () => {
  it('todo a un pote', () => {
    expect(repartirPago(30000, 'llave', null)).toEqual({ llave: 30000, efectivo: 0 });
    expect(repartirPago(30000, 'efectivo', null)).toEqual({ llave: 0, efectivo: 30000 });
  });

  it('mixto: el efectivo es el resto', () => {
    expect(repartirPago(30000, 'mixto', 20000)).toEqual({ llave: 20000, efectivo: 10000 });
  });

  it('sin elegir o mixto inválido devuelve null', () => {
    expect(repartirPago(30000, null, null)).toBeNull();
    expect(repartirPago(30000, 'mixto', 40000)).toBeNull();
    expect(repartirPago(30000, 'mixto', null)).toBeNull();
  });
});

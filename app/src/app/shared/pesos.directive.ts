import { Directive, ElementRef, forwardRef, input, output, effect } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** 30000 → "30.000" (pesos colombianos, sin decimales). */
export function formatearPesos(valor: number | null | undefined): string {
  return valor == null || Number.isNaN(valor) ? '' : Math.round(valor).toLocaleString('es-CO');
}

/** "30.000" (o "30000", "$ 30,000") → 30000; vacío → null. */
export function leerPesos(texto: string | null | undefined): number | null {
  const digitos = (texto ?? '').replace(/\D/g, '');
  return digitos ? Number(digitos) : null;
}

/**
 * Campo de dinero con separador de miles automático: se escribe 30000 y se ve "30.000".
 * Con [(ngModel)] el modelo recibe el número. Sin ngModel: [pesosValor] para mostrar un
 * valor y (pesosCambio) al terminar de editar (Enter o salir del campo).
 */
@Directive({
  selector: 'input[appPesos]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PesosDirective), multi: true }],
  host: {
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    '(input)': 'alEscribir()',
    '(blur)': 'alTocar()',
    '(change)': 'alCambiar()',
  },
})
export class PesosDirective implements ControlValueAccessor {
  /** Valor a mostrar cuando no se usa ngModel. */
  readonly pesosValor = input<number | null | undefined>(undefined);
  /** Número al terminar de editar (Enter o salir del campo). */
  readonly pesosCambio = output<number | null>();

  private alCambiarModelo: (v: number | null) => void = () => undefined;
  private alTocarModelo: () => void = () => undefined;

  constructor(private readonly el: ElementRef<HTMLInputElement>) {
    effect(() => {
      const v = this.pesosValor();
      if (v !== undefined) this.el.nativeElement.value = formatearPesos(v);
    });
  }

  writeValue(valor: number | null): void {
    this.el.nativeElement.value = formatearPesos(valor);
  }

  registerOnChange(fn: (v: number | null) => void): void {
    this.alCambiarModelo = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.alTocarModelo = fn;
  }

  setDisabledState(deshabilitado: boolean): void {
    this.el.nativeElement.disabled = deshabilitado;
  }

  /** Reformatea mientras se escribe sin mover el cursor de su lugar entre los dígitos. */
  alEscribir(): void {
    const campo = this.el.nativeElement;
    const cursor = campo.selectionStart ?? campo.value.length;
    const digitosAntes = campo.value.slice(0, cursor).replace(/\D/g, '').length;
    const valor = leerPesos(campo.value);
    const texto = formatearPesos(valor);
    campo.value = texto;
    let pos = 0;
    let vistos = 0;
    while (pos < texto.length && vistos < digitosAntes) {
      if (/\d/.test(texto[pos])) vistos++;
      pos++;
    }
    try {
      campo.setSelectionRange(pos, pos);
    } catch {
      /* algunos teclados no permiten mover el cursor */
    }
    this.alCambiarModelo(valor);
  }

  alTocar(): void {
    this.alTocarModelo();
  }

  alCambiar(): void {
    this.pesosCambio.emit(leerPesos(this.el.nativeElement.value));
  }
}

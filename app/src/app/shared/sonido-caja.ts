/**
 * Sonido de caja registradora ("cha-ching") generado con Web Audio, sin archivos:
 * un golpe metálico corto (el cajón) y dos campanazos agudos que se apagan.
 * Se usa cuando se alquila una consola y cuando se acaba el tiempo de una consola.
 * Si el navegador bloquea el audio (sin un toque previo en la página), no suena y la
 * alerta visual sigue funcionando.
 */
export function sonarCaja(veces = 1): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const salida = ctx.createGain();
    salida.gain.value = 0.35;
    salida.connect(ctx.destination);

    const DURACION = 0.9; // segundos de cada cha-ching
    for (let i = 0; i < veces; i++) {
      const t = ctx.currentTime + 0.02 + i * DURACION;
      golpeCajon(ctx, salida, t);
      campana(ctx, salida, t + 0.07, 2093); // Do 7
      campana(ctx, salida, t + 0.17, 2637); // Mi 7
    }
    setTimeout(() => ctx.close(), (veces * DURACION + 1.5) * 1000);
  } catch {
    /* audio bloqueado: queda el aviso en pantalla */
  }
}

/** "Cha": ruido corto filtrado, como el golpe del cajón y las teclas. */
function golpeCajon(ctx: AudioContext, salida: AudioNode, t: number): void {
  const largo = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, largo, ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < largo; i++) datos[i] = (Math.random() * 2 - 1) * (1 - i / largo);
  const ruido = ctx.createBufferSource();
  ruido.buffer = buffer;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = 3000;
  filtro.Q.value = 0.8;
  const vol = ctx.createGain();
  vol.gain.setValueAtTime(0.9, t);
  vol.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  ruido.connect(filtro).connect(vol).connect(salida);
  ruido.start(t);
  ruido.stop(t + 0.09);
}

/** "Ching": campana metálica (fundamental + parciales) que se apaga sola. */
function campana(ctx: AudioContext, salida: AudioNode, t: number, frecuencia: number): void {
  const parciales: [number, number][] = [
    [1, 0.6],
    [2.0, 0.25],
    [3.01, 0.15],
    [4.2, 0.08],
  ];
  for (const [factor, nivel] of parciales) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frecuencia * factor;
    const vol = ctx.createGain();
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(nivel, t + 0.005);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.7 / factor + 0.3);
    osc.connect(vol).connect(salida);
    osc.start(t);
    osc.stop(t + 1.1);
  }
}

// Raw-WebGL fullscreen shader for the Obsidian living background (spec §9).
// Kept off three.js so it adds ~0 to the 3D chunk. Red/white↔gold fbm ribbons
// on near-black, pointer drift, scroll-driven intensity, FPS-guarded.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`

const FRAG = `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uPointer;   // -1..1, lerped
uniform float uScroll;   // intensity 0.45..1.0
uniform vec3 uHi;        // highlight colour, white<->gold
float hash(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.)), c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  p += uPointer*0.05;                       // parallax drift
  float t = uTime*0.04;
  float warp = fbm(p*2.0 - vec2(t));
  float f = fbm(p*1.5 + vec2(t, -t*0.5) + warp*0.6);
  vec3 col = vec3(0.023,0.023,0.027);       // #060607 void
  float red1 = smoothstep(0.45,0.9,f);
  col = mix(col, vec3(0.514,0.016,0.004), red1*0.85*uScroll);  // #830401
  float red2 = smoothstep(0.72,1.02,f);
  col = mix(col, vec3(0.910,0.137,0.168), red2*0.6*uScroll);   // #E8232B
  float hi = smoothstep(0.86,1.02, fbm(p*2.4 + t*1.3 + 5.0));
  col = mix(col, uHi, hi*0.12*uScroll);      // ≤12% highlight
  float vig = smoothstep(1.25,0.15, length(p));
  col *= mix(0.35, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
}`

const WHITE: [number, number, number] = [0.957, 0.957, 0.965] // #F4F4F6
const GOLD: [number, number, number] = [1.0, 0.827, 0.302] // #FFD34D

export type ObsidianBGOptions = { onDegrade?: () => void }

export class ObsidianBG {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private uni: Record<string, WebGLUniformLocation | null> = {}
  private raf = 0
  private start = performance.now()
  private prev = performance.now()
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  private scroll = 1
  private disposed = false
  private slow = { acc: 0, frames: 0, since: performance.now() }

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: ObsidianBGOptions = {},
  ) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
    if (!gl) throw new Error('no webgl')
    this.gl = gl

    const vs = this.compile(gl.VERTEX_SHADER, VERT)
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('link: ' + gl.getProgramInfoLog(program))
    this.program = program
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    for (const n of ['uTime', 'uRes', 'uPointer', 'uScroll', 'uHi'])
      this.uni[n] = gl.getUniformLocation(program, n)

    window.addEventListener('pointermove', this.onMove)
    this.resize()
    this.raf = requestAnimationFrame(this.tick)
  }

  private compile(type: number, src: string) {
    const gl = this.gl
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error('shader: ' + gl.getShaderInfoLog(s))
    return s
  }

  private onMove = (e: PointerEvent) => {
    this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1
    this.pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1)
  }

  /** hero = 1.0, content sections = 0.45 (spec §9) */
  setScroll(intensity: number) {
    this.scroll = intensity
  }

  private tick = (now: number) => {
    const dt = now - this.prev
    this.prev = now

    // FPS guard: >24ms avg over 3s → degrade to poster permanently
    this.slow.acc += dt
    this.slow.frames++
    if (now - this.slow.since > 3000) {
      if (this.slow.acc / this.slow.frames > 24) {
        this.opts.onDegrade?.()
        this.dispose()
        return
      }
      this.slow = { acc: 0, frames: 0, since: now }
    }

    const gl = this.gl
    this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.08
    this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.08

    const lp = (Math.sin(((now - this.start) * 0.001 * Math.PI) / 3) + 1) / 2 // ~6s white↔gold
    gl.uniform1f(this.uni.uTime, (now - this.start) / 1000)
    gl.uniform2f(this.uni.uRes, this.canvas.width, this.canvas.height)
    gl.uniform2f(this.uni.uPointer, this.pointer.x, this.pointer.y)
    gl.uniform1f(this.uni.uScroll, this.scroll)
    gl.uniform3f(
      this.uni.uHi,
      WHITE[0] + (GOLD[0] - WHITE[0]) * lp,
      WHITE[1] + (GOLD[1] - WHITE[1]) * lp,
      WHITE[2] + (GOLD[2] - WHITE[2]) * lp,
    )
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.raf = requestAnimationFrame(this.tick)
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio, 1.5)
    const w = Math.floor(window.innerWidth * dpr)
    const h = Math.floor(window.innerHeight * dpr)
    this.canvas.width = w
    this.canvas.height = h
    this.gl.viewport(0, 0, w, h)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('pointermove', this.onMove)
    const ext = this.gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
  }
}

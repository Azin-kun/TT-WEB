import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

/** Load the Draco-compressed logo mesh (decoder served from /draco/). */
export async function loadLogo(): Promise<THREE.Group> {
  const draco = new DRACOLoader()
  draco.setDecoderPath('/draco/')
  const loader = new GLTFLoader()
  loader.setDRACOLoader(draco)
  const gltf = await loader.loadAsync('/models/logo.draco.glb')
  draco.dispose()
  return gltf.scene
}

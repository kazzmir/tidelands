import * as THREE from 'three';

export function createLeaderAnchorMarker(): THREE.Group {
  const marker = new THREE.Group();
  marker.name = 'leader-destination-anchor';
  marker.renderOrder = 5;
  const material = new THREE.MeshBasicMaterial({
    color: '#ffd34f',
    depthTest: false,
    depthWrite: false,
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), material);
  shaft.position.y = 0.47;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.025, 6, 16), material);
  ring.position.y = 0.85;
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), material);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.y = 0.6;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.28, 0.4, 0),
    new THREE.Vector3(-0.23, 0.2, 0),
    new THREE.Vector3(0, 0.12, 0),
    new THREE.Vector3(0.23, 0.2, 0),
    new THREE.Vector3(0.28, 0.4, 0),
  ]);
  const arms = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.027, 6, false), material);
  marker.add(shaft, ring, crossbar, arms);
  for (const sign of [-1, 1]) {
    const hook = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.15, 4), material);
    hook.position.set(sign * 0.28, 0.4, 0);
    hook.rotation.z = sign * -0.4;
    marker.add(hook);
  }
  const base = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 24), material);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.025;
  marker.add(base);
  marker.visible = false;
  return marker;
}

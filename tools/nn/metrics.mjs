// Evaluation only. Normalize the projected nose just as the raw sensors do.
export const horizontalSpeed = car => Math.hypot(car.vx, car.vz);
export function horizontalSlip(car) {
  const length = Math.hypot(car.R[0], car.R[6]) || 1;
  const hx = car.R[0] / length, hz = car.R[6] / length;
  const forward = car.vx * hx + car.vz * hz, right = -car.vx * hz + car.vz * hx;
  return horizontalSpeed(car) > 1 ? Math.atan2(right, Math.abs(forward)) : 0;
}

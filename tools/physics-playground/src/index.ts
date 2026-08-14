import RAPIER from "@dimforge/rapier2d-compat";

export interface WindmillModeResult {
  readonly mode: "KINEMATIC" | "REVOLUTE_MOTOR";
  readonly impacts: number;
  readonly finalRotation: number;
  readonly finalAngularVelocity: number;
  readonly maxTrackingError: number;
}

export interface WindmillComparison {
  readonly timestep: number;
  readonly steps: number;
  readonly targetAngularVelocity: number;
  readonly kinematic: WindmillModeResult;
  readonly revoluteMotor: WindmillModeResult;
}

const angularDistance = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

let ready: Promise<void> | null = null;
async function initialize(): Promise<void> { ready ??= RAPIER.init(); await ready; }

export async function compareWindmillArchitectures(steps = 480, timestep = 1 / 240): Promise<WindmillComparison> {
  await initialize();
  const world = new RAPIER.World({ x: 0, y: 9.80665 });
  world.timestep = timestep;
  const events = new RAPIER.EventQueue(true);
  const targetAngularVelocity = Math.PI;

  const kinematic = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0.15, 0.2));
  const kinematicCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.04, 0.002).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), kinematic);

  const anchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0.35, 0.2));
  const motorBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0.35, 0.2).setAngularDamping(0.02));
  const motorCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.04, 0.002).setDensity(2).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), motorBody);
  const joint = world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }), anchor, motorBody, true) as RAPIER.RevoluteImpulseJoint;
  joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
  joint.configureMotorVelocity(targetAngularVelocity, 0.35);

  const ballColliders = [0.15, 0.35].map((x) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x + 0.025, 0.08).setCcdEnabled(true));
    return world.createCollider(RAPIER.ColliderDesc.ball(0.0055).setMass(0.00555).setRestitution(0.35).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  });
  const ballHandles = new Set(ballColliders.map((collider) => collider.handle));
  let kinematicImpacts = 0;
  let motorImpacts = 0;
  let maxKinematicError = 0;
  let maxMotorError = 0;

  for (let step = 0; step < steps; step += 1) {
    const targetRotation = targetAngularVelocity * (step + 1) * timestep;
    kinematic.setNextKinematicRotation(targetRotation);
    world.step(events);
    events.drainCollisionEvents((first, second, started) => {
      if (!started) return;
      const other = ballHandles.has(first) ? second : ballHandles.has(second) ? first : null;
      if (other === kinematicCollider.handle) kinematicImpacts += 1;
      if (other === motorCollider.handle) motorImpacts += 1;
    });
    maxKinematicError = Math.max(maxKinematicError, angularDistance(kinematic.rotation(), targetRotation));
    maxMotorError = Math.max(maxMotorError, angularDistance(motorBody.rotation(), targetRotation));
  }

  const result: WindmillComparison = {
    timestep,
    steps,
    targetAngularVelocity,
    kinematic: { mode: "KINEMATIC", impacts: kinematicImpacts, finalRotation: kinematic.rotation(), finalAngularVelocity: kinematic.angvel(), maxTrackingError: maxKinematicError },
    revoluteMotor: { mode: "REVOLUTE_MOTOR", impacts: motorImpacts, finalRotation: motorBody.rotation(), finalAngularVelocity: motorBody.angvel(), maxTrackingError: maxMotorError },
  };
  world.free();
  events.free();
  return result;
}

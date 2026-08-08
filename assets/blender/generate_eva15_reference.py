"""Build an original, dimensioned pachinko cabinet inspired by Eva 15's layout.

The board JSON is the collision source of truth. This file creates visual meshes
only and deliberately contains no copyrighted artwork, logos, or characters.
"""

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
BOARD_PATH = ROOT / "boards/prototype/eva15_inspired_physics_v1.json"
BLEND_PATH = ROOT / "assets/blender/eva15_reference_cabinet.blend"
GLB_PATH = ROOT / "assets/models/eva15_reference_cabinet_blender.glb"
PREVIEW_PATH = ROOT / "assets/images/eva15_reference_cabinet.png"
MM = 0.001


def material(name, color, metallic=0.0, roughness=0.45, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    return mat


def cube(name, location, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Edge softness", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    obj.data.materials.append(mat)
    return obj


def cylinder(name, location, radius, depth, mat, rotation=(math.pi / 2, 0, 0), vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def segment(name, start, end, depth, mat, thickness):
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    obj = cube(name, (a + b) / 2, (delta.length / 2, depth / 2, thickness / 2), mat, thickness * 0.25)
    obj.rotation_euler[1] = -math.atan2(delta.z, delta.x)
    return obj


def board_point(point, depth=0.018):
    return ((point["x"] - 250) * MM, depth, (500 - point["y"]) * MM)


def add_text(name, text, location, size, mat):
    bpy.ops.object.text_add(location=location, rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.001
    obj.data.materials.append(mat)
    return obj


with BOARD_PATH.open(encoding="utf-8") as source:
    board = json.load(source)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    pass

black = material("Cabinet black", (0.008, 0.012, 0.02, 1), metallic=0.2, roughness=0.22)
purple = material("Deep violet", (0.12, 0.015, 0.25, 1), metallic=0.45, roughness=0.24)
violet = material("Violet trim", (0.42, 0.04, 0.88, 1), metallic=0.38, roughness=0.2)
green = material("Signal green", (0.22, 0.95, 0.18, 1), metallic=0.2, roughness=0.25)
orange = material("Signal orange", (1.0, 0.24, 0.025, 1), metallic=0.2, roughness=0.25)
steel = material("Machined steel", (0.48, 0.55, 0.62, 1), metallic=0.92, roughness=0.18)
brass = material("Pin brass", (0.66, 0.46, 0.14, 1), metallic=0.9, roughness=0.2)
playfield = material("Printed playfield", (0.035, 0.048, 0.075, 1), metallic=0.05, roughness=0.32)
screen = material("Inactive display", (0.008, 0.02, 0.032, 1), metallic=0.15, roughness=0.12)
glass = material("Front glass", (0.55, 0.72, 0.88, 0.16), roughness=0.08, transmission=0.82)
white = material("Lettering", (0.78, 0.9, 1.0, 1), metallic=0.1, roughness=0.32)

# Cabinet, lower console, playfield and protective glass.
cube("Cabinet", (0, 0.055, 0.31), (0.33, 0.075, 0.43), black, 0.025)
cube("Violet inner frame", (0, -0.024, 0.34), (0.286, 0.018, 0.342), purple, 0.032)
cube("Playfield board", (0, -0.048, 0.29), (0.25, 0.008, 0.25), playfield, 0.008)
cube("Glass", (0, -0.079, 0.32), (0.276, 0.004, 0.326), glass, 0.012)
cube("Lower console", (0, -0.015, -0.055), (0.325, 0.12, 0.095), purple, 0.025)
cube("Ball tray", (-0.075, -0.145, -0.025), (0.19, 0.08, 0.025), black, 0.018)

# Original center display/bezel with asymmetric modern-machine silhouette.
cube("Center display", (0, -0.083, 0.278), (0.102, 0.008, 0.075), screen, 0.012)
cube("Center bezel", (0, -0.072, 0.278), (0.132, 0.012, 0.105), violet, 0.026)
cube("Center display front", (0, -0.087, 0.278), (0.103, 0.004, 0.076), screen, 0.01)
segment("Upper armor left", (-0.18, -0.086, 0.34), (-0.02, -0.086, 0.405), 0.018, purple, 0.022)
segment("Upper armor right", (0.02, -0.086, 0.405), (0.19, -0.086, 0.33), 0.018, purple, 0.022)
segment("Green accent left", (-0.18, -0.097, 0.335), (-0.035, -0.097, 0.393), 0.009, green, 0.006)
segment("Orange accent right", (0.035, -0.097, 0.393), (0.19, -0.097, 0.325), 0.009, orange, 0.006)

# Physical rails from the board definition.
for rail in board.get("rails", []):
    segment(f"Rail {rail['id']}", board_point(rail["from"]), board_point(rail["to"]), 0.010, steel, rail["thickness"] * MM)
for gate in board.get("gates", []):
    if gate["enabled"]:
        segment(f"Gate {gate['id']}", board_point(gate["from"]), board_point(gate["to"]), 0.010, steel, gate["thickness"] * MM)
for arc in board.get("arcRails", []):
    start = math.radians(arc["startAngleDegrees"])
    end = math.radians(arc["endAngleDegrees"])
    count = arc["segments"]
    for index in range(count):
        a = start + (end - start) * index / count
        b = start + (end - start) * (index + 1) / count
        p1 = {"x": arc["center"]["x"] + math.cos(a) * arc["radius"], "y": arc["center"]["y"] + math.sin(a) * arc["radius"]}
        p2 = {"x": arc["center"]["x"] + math.cos(b) * arc["radius"], "y": arc["center"]["y"] + math.sin(b) * arc["radius"]}
        segment(f"Arc {arc['id']} {index:02}", board_point(p1), board_point(p2), 0.010, steel, arc["thickness"] * MM)

# Brass nails use authored positions and visibly preserve disabled clearance pins.
for nail in board["nails"]:
    if not nail["enabled"]:
        continue
    x = (nail["positionX"] - 250) * MM
    z = (500 - nail["positionY"]) * MM
    cylinder(f"Nail {nail['id']}", (x, -0.068, z), nail["radius"] * MM, 0.027, brass, vertices=16)
    cylinder(f"Nail head {nail['id']}", (x, -0.084, z), 0.0032, 0.0022, steel, vertices=20)

# Right-play landmarks: through gate, electric support and attacker references.
segment("Right gate upper", (0.145, -0.088, 0.285), (0.205, -0.088, 0.255), 0.012, steel, 0.004)
segment("Right gate lower", (0.205, -0.088, 0.255), (0.158, -0.088, 0.225), 0.012, steel, 0.004)
cube("Right through", (0.178, -0.091, 0.245), (0.018, 0.008, 0.006), green, 0.004)
cube("Electric support", (0.148, -0.091, 0.17), (0.034, 0.01, 0.012), white, 0.005)
cube("Attacker", (0.115, -0.091, 0.105), (0.07, 0.012, 0.014), orange, 0.005)

# Handle and control landmarks.
cylinder("Launch handle", (0.235, -0.15, -0.065), 0.047, 0.045, black, rotation=(math.pi / 2, 0, 0), vertices=48)
cylinder("Handle violet ring", (0.235, -0.176, -0.065), 0.036, 0.009, violet, rotation=(math.pi / 2, 0, 0), vertices=48)
add_text("Machine label", "TYPE-15 REFERENCE", (0, -0.102, 0.585), 0.026, white)
add_text("Physics label", "PHYSICAL GAUGE / LEFT + RIGHT", (0, -0.103, -0.05), 0.014, white)

# Camera and studio lighting.
bpy.ops.object.camera_add(location=(0, -1.62, 0.29), rotation=(math.radians(90), 0, 0))
camera = bpy.context.object
camera.name = "Front Camera"
camera.data.type = "ORTHO"
camera.data.ortho_scale = 0.96
bpy.context.scene.camera = camera
bpy.ops.object.light_add(type="AREA", location=(-0.42, -0.65, 0.72), rotation=(math.radians(35), 0, math.radians(-25)))
bpy.context.object.data.energy = 900
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 0.5
bpy.ops.object.light_add(type="AREA", location=(0.45, -0.45, 0.20), rotation=(math.radians(65), 0, math.radians(150)))
bpy.context.object.data.energy = 650
bpy.context.object.data.color = (0.45, 0.25, 1.0)
bpy.context.object.data.size = 0.35

scene = bpy.context.scene
scene["asset_role"] = "visual_only"
scene["collision_source"] = str(BOARD_PATH.relative_to(ROOT))
scene["reference_policy"] = "reference-based approximation; no official artwork"
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 900
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(PREVIEW_PATH)
scene.world.color = (0.006, 0.008, 0.014)

BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.export_scene.gltf(filepath=str(GLB_PATH), export_format="GLB", export_apply=True)
bpy.ops.render.render(write_still=True)
print(json.dumps({"blend": str(BLEND_PATH), "glb": str(GLB_PATH), "preview": str(PREVIEW_PATH), "objects": len(scene.objects)}))

# Builds the runner animation strips (run, walk, look, stumble, cheer, fall) (assets/runner-*.png) from assets/runner.png by moving its
# real pixels, so colours and the ITC logo stay exactly as drawn.
#
#   python tools/make_runner_frames.py            (run from the project folder; needs Pillow + numpy)
#   python tools/make_runner_frames.py assets preview.png    (also saves an enlarged preview sheet)
#
# The limb positions below match the 44 x 43 runner.png. If you redraw him with a different
# layout, update HEAD / ARMS_TOP / LEGS_TOP / the column ranges.
import sys, math
import numpy as np
from PIL import Image

assets = sys.argv[1] if len(sys.argv) > 1 else "assets"
base = np.asarray(Image.open(assets + "/runner.png").convert("RGBA")).copy()
H, W = base.shape[:2]                      # 43 x 44
HEAD = (0, 16)                             # rows of hair, face, neck
ARMS_TOP, LEGS_TOP, BOTTOM = 23, 33, 42    # arm rows 23-32, leg rows 33-42
LEFT_ARM, RIGHT_ARM = (14, 17), (26, 29)   # column ranges [a, b)
LEFT_LEG, RIGHT_LEG = (15, 21), (22, 28)

def strip(rows, cols):
    return base[rows[0]:rows[1], cols[0]:cols[1]].copy()

def resize_middle(part, height, middle):
    """Make a limb `height` rows tall by removing or repeating rows from its middle (keeps hips/shoulders and feet/hands)."""
    rows = list(range(part.shape[0]))
    while len(rows) > height:
        rows.pop(middle)
    while len(rows) < height:
        rows.insert(middle, middle)
    return part[rows]

def paste(frame, part, top, left):
    for r in range(part.shape[0]):
        y = top + r
        if 0 <= y < H:
            for c in range(part.shape[1]):
                x = left + c
                if 0 <= x < W and part[r, c, 3] > 0:
                    frame[y, x] = part[r, c]

body = base.copy()
body[ARMS_TOP:LEGS_TOP, LEFT_ARM[0]:LEFT_ARM[1]] = 0
body[ARMS_TOP:LEGS_TOP, RIGHT_ARM[0]:RIGHT_ARM[1]] = 0
body[LEGS_TOP:, :] = 0
body_above_legs = body[:LEGS_TOP]

def pose(bob=0, left_leg=0, right_leg=0, left_arm=0, right_arm=0, arms_out=0, head=None, shift_x=0):
    """bob: body raised (+) or lowered (-) in pixels. *_leg: how far that foot is off the ground.
    *_arm: how far that hand rises (forearm swinging toward the camera). arms_out: arms pushed sideways."""
    frame = np.zeros_like(base)
    top = 0 - bob
    # legs first: hips follow the body, feet stay on the ground unless lifted
    for (cols, lift) in ((LEFT_LEG, left_leg), (RIGHT_LEG, right_leg)):
        leg = strip((LEGS_TOP, BOTTOM + 1), cols)
        hip = LEGS_TOP - bob
        foot = BOTTOM - lift
        paste(frame, resize_middle(leg, max(3, foot - hip + 1), 3), hip, cols[0] + shift_x)
    paste(frame, body_above_legs, top, shift_x)
    if head is not None:
        frame[max(0, top):HEAD[1] + 1 + top] = 0
        paste(frame, head, top, shift_x)
    for (cols, rise, side) in ((LEFT_ARM, left_arm, -1), (RIGHT_ARM, right_arm, 1)):
        arm = strip((ARMS_TOP, LEGS_TOP), cols)
        paste(frame, resize_middle(arm, max(3, arm.shape[0] - rise), 4), ARMS_TOP - bob, cols[0] + side * arms_out + shift_x)
    return frame

def raised_arm(cols, length=10):
    """An arm thrown straight up: the arm flipped so the fist is on top."""
    arm = strip((ARMS_TOP, LEGS_TOP), cols)[::-1]
    return resize_middle(arm, length, 4)

def turned_head(direction=-1):
    """Looking back over his shoulder: the face slides sideways inside the hair, so the head reads
    as turned, with hair filling the side he's turned away from. Plus a sweat drop."""
    head = base[HEAD[0]:HEAD[1] + 1].copy()
    outline = head[:, :, 3] > 0
    r, g, b = head[:, :, 0].astype(int), head[:, :, 1].astype(int), head[:, :, 2].astype(int)
    face = outline & ((r > 90) | ((r + g + b) > 330))      # skin, eyes, mouth (everything lighter than hair)
    face[:5] = False                                     # forehead hair stays put
    hair = np.array([41, 31, 30, 255], np.uint8)
    turned = head.copy()
    turned[face] = hair                                  # where the face was: hair now
    shifted = np.zeros_like(head)
    shifted[:, max(0, direction * 2):head.shape[1] + min(0, direction * 2)] = head[:, max(0, -direction * 2):head.shape[1] + min(0, -direction * 2)]
    moved_face = np.roll(face, direction * 2, axis=1)
    keep = moved_face & outline                          # the face can't stick out past the hair outline
    turned[keep] = shifted[keep]
    drop = np.array([170, 225, 255, 255], np.uint8)
    edge = int(np.nonzero(outline[8])[0].max()) if direction < 0 else int(np.nonzero(outline[8])[0].min())
    x = edge + (2 if direction < 0 else -2)
    turned[9, x] = drop; turned[10, x] = drop
    return turned

def lean(frame, head_dx, chest_dx):
    """Tilt the upper body sideways in whole bands (head furthest, chest less, hips not at all),
    so the ITC logo moves as one piece instead of being sheared into a staircase."""
    leaned = frame.copy()
    leaned[:17] = np.roll(frame[:17], head_dx, axis=1)          # hair, face, neck
    leaned[17:29] = np.roll(frame[17:29], chest_dx, axis=1)     # shoulders and chest (the logo rows)
    return leaned

def save(name, frames):
    sheet = np.concatenate(frames, axis=1)
    Image.fromarray(sheet, "RGBA").save(assets + "/" + name)
    print(name, len(frames), "frames", sheet.shape[1], "x", sheet.shape[0])
    return sheet

# RUN: 8 frames. Knees lift in turn (front-on, a lifted leg looks shorter), arms pump opposite, body bobs.
run = []
for i in range(8):
    s = math.sin(2 * math.pi * i / 8)
    left = round(max(0, s) * 3); right = round(max(0, -s) * 3)
    run.append(pose(bob=round(abs(s)), left_leg=left, right_leg=right, left_arm=right * 2, right_arm=left * 2))
sheets = {"run": save("runner-run.png", run)}

# WALK: 8 frames, the same cycle with small steps, no bounce, arms swinging loosely
walk = []
for i in range(8):
    s = math.sin(2 * math.pi * i / 8)
    left = round(max(0, s)); right = round(max(0, -s))
    walk.append(pose(left_leg=left, right_leg=right, left_arm=right * 2, right_arm=left * 2))
sheets["walk"] = save("runner-walk.png", walk)

# LOOK BACK: two stride frames with the head turned
head = turned_head()
sheets["look"] = save("runner-look.png", [pose(bob=1, left_leg=3, right_arm=6, head=head), pose(bob=1, right_leg=3, left_arm=6, head=head)])

# STUMBLE: knocked low with arms flung out
sheets["stumble"] = save("runner-stumble.png", [lean(pose(bob=-2, left_leg=2, arms_out=1, left_arm=4, right_arm=4), 3, 1),
                                                lean(pose(bob=-1, right_leg=1, arms_out=2, left_arm=6, right_arm=2), -2, -1)])

# CHEER: a hop with one fist up, then both
c1 = pose(bob=2, left_leg=1, right_leg=1)
c1[ARMS_TOP - 2:LEGS_TOP - 2, RIGHT_ARM[0]:RIGHT_ARM[1]] = 0
paste(c1, raised_arm(RIGHT_ARM), 11, RIGHT_ARM[0] + 1)
c2 = pose(bob=4, left_leg=2, right_leg=2)
for cols, dx in ((LEFT_ARM, -1), (RIGHT_ARM, 1)):
    c2[ARMS_TOP - 4:LEGS_TOP - 4, cols[0]:cols[1]] = 0
    paste(c2, raised_arm(cols), 9, cols[0] + dx)
sheets["cheer"] = save("runner-cheer.png", [c1, c2])

# FALL: knees buckle, crouch, then flat on the ground
f1 = pose(bob=-3, arms_out=1, left_arm=3, right_arm=3)
f2 = pose(bob=-7, arms_out=2, left_arm=5, right_arm=5)
lying = np.rot90(base, k=-1)                       # head to the right
ys, xs = np.nonzero(lying[:, :, 3])
lying = lying[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
f3 = np.zeros_like(base)
paste(f3, lying, H - lying.shape[0], (W - lying.shape[1]) // 2)
sheets["fall"] = save("runner-fall.png", [f1, f2, f3])

# optional preview sheet: every strip, scaled up, on a dark background
if len(sys.argv) < 3:
    sys.exit(0)
rows = [np.concatenate([sheets[k], np.zeros((H, 44 * 8 - sheets[k].shape[1], 4), np.uint8)], axis=1) for k in ("run", "walk", "look", "stumble", "cheer", "fall")]
sheet = np.concatenate(rows, axis=0)
bg = Image.new("RGBA", (sheet.shape[1], sheet.shape[0]), (25, 10, 45, 255))
bg.alpha_composite(Image.fromarray(sheet, "RGBA"))
bg.resize((bg.width * 4, bg.height * 4), Image.NEAREST).save(sys.argv[2])

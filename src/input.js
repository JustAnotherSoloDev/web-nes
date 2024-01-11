//Key value input for the emulator
KEY_A = 1;
KEY_B = 2;
KEY_SELECT = 4;
KEY_START = 8;
KEY_UP = 16;
KEY_DOWN = 32;
KEY_LEFT = 64;
KEY_RIGHT = 128;

BUTTON_MAPPING = {
  button_a: KEY_A,
  button_b: KEY_B,
  button_ab: KEY_A | KEY_B,
  button_start: KEY_START,
  button_select: KEY_SELECT,
};

DIRECTION_MAPPING = {
  up: KEY_UP,
  down: KEY_DOWN,
  left: KEY_LEFT,
  right: KEY_RIGHT,
};

// Note: The following variable is global, and represents our live button state for the emulator:
// var keys = [0,0];
var bufferCreated = 0;
var keys = [0, 0, 0];
var touchKeys = [0, 0, 0];

var controllerKeyMaps = [];

//default keyMap
controllerKeyMaps[1] = [
  "x",
  "y",
  "Shift",
  "Enter",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];

controllerKeyMaps[2] = ["-", "-", "-", "-", "-", "-", "-", "-"];

//on keydown update the signal the keypress to the emulator
window.addEventListener("keydown", function (event) {
  for (var c = 1; c <= 2; c++) {
    for (var i = 0; i < 8; i++) {
      if (event.key == controllerKeyMaps[c][i]) {
        keys[c] = keys[c] | (0x1 << i);
      }
    }
  }
});
//on keyup update the signal to the emulator
window.addEventListener("keyup", function (event) {
  for (var c = 1; c <= 2; c++) {
    for (var i = 0; i < 8; i++) {
      if (event.key == controllerKeyMaps[c][i]) {
        keys[c] = keys[c] & ~(0x1 << i);
      }
    }
  }
});

function saveInputConfig() {
  try {
    window.localStorage.setItem(
      "keyboard_1",
      JSON.stringify(controllerKeyMaps[1])
    );
    window.localStorage.setItem(
      "keyboard_2",
      JSON.stringify(controllerKeyMaps[2])
    );
    console.log("Input Config Saved!");
  } catch (e) {
    console.log(
      "Local Storage is probably unavailable! Input configuration will not persist."
    );
  }
}

function loadInputConfig() {
  var keyboard_1 = window.localStorage.getItem("keyboard_1");
  if (keyboard_1) {
    controllerKeyMaps[1] = JSON.parse(keyboard_1);
  }
  var keyboard_2 = window.localStorage.getItem("keyboard_2");
  if (keyboard_2) {
    controllerKeyMaps[2] = JSON.parse(keyboard_2);
  }
}

/*
Assign events to gamepad
*/
function bindTouchControls() {
  let controls = document.querySelectorAll(".gamepad .control");
  for (let i = 0; i < controls.length; i++) {
    let control = controls[i];
    control.addEventListener("touchstart", handleTouchStart);
    control.addEventListener("touchend", handleTouchEnd);
  }
}

function handleTouchStart(event) {
  let key = event.target.getAttribute("data-key");
  let value = parseInt(key);
  keys[1] = keys[1] | (0x1 << value);
  console.log(keys);
  event.preventDefault();
}

function handleTouchEnd(event) {
  let key = event.target.getAttribute("data-key");
  let value = parseInt(key);
  keys[1] = keys[1] & ~(0x1 << value);
  console.log(keys);
  event.preventDefault();
}

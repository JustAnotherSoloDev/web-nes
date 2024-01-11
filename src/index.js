import * as config from "./configHelper.js";

let g_last_frame_sample_count = 44100 / 60; // Close-ish enough nes audio sampling
let g_audio_samples_buffered = 0;
let g_new_frame_sample_threshold = 4096; // under which we request a new audio frame
let g_audio_overrun_sample_threshold = 8192; // over which we *drop* samples

//data will be filled into screen buffer by wasm
let g_screen_buffers = [];
let g_piano_roll_buffers = [];
let g_last_rendered_buffer_index;
//frames to be buffered.
let g_total_buffers = 16;

let g_frames_since_last_fps_count,
  g_pending_frames = 0,
  g_next_free_buffer_index = 0;
let audioContext = null,
  audioNode = null;

let idle_accumulator;

let emulatorInitialized = false;
let cartridgeInserted = false;

let p1Input = [0, 0, 0];
let p2Input = [0, 0, 0];

let canvas = document.querySelector("#pixels");

//create buffers
for (let i = 0; i < g_total_buffers; i++) {
  // Allocate a good number of screen buffers
  g_screen_buffers[i] = new ArrayBuffer(256 * 240 * 4);
  g_piano_roll_buffers[i] = new ArrayBuffer(480 * 270 * 4);
}

var emulatorWorker = new Worker("emuWorker.js");

emulatorWorker.onmessage = function (e) {
  const messageType = e.data.type;
  switch (messageType) {
    case "init": {
      console.log("emulator initialized");
      emulatorInitialized = true;
      break;
    }
    case "deliverFrame":
      {
        if (e.data.panels.length > 0) {
          g_rendered_frames.push(e.data.panels);
          for (let panel of e.data.panels) {
            if (panel.id == "screen") {
              g_screen_buffers[g_last_rendered_buffer_index] =
                panel.image_buffer;
            }
            if (panel.id == "piano_roll_window") {
              g_piano_roll_buffers[g_last_rendered_buffer_index] =
                panel.image_buffer;
            }
          }
          g_last_rendered_buffer_index += 1;
          if (g_last_rendered_buffer_index >= g_total_buffers) {
            g_last_rendered_buffer_index = 0;
          }
          g_frames_since_last_fps_count += 1;
        }
        g_pending_frames -= 1;
        if (g_audio_samples_buffered < g_audio_overrun_sample_threshold) {
          audioNode.port.postMessage({
            type: "samples",
            samples: e.data.audio_buffer,
          });
          g_audio_samples_buffered += e.data.audio_buffer.length;
          g_last_frame_sample_count = e.data.audio_buffer.length;
        } else {
          // Audio overrun, we're running too fast! Drop these samples on the floor and bail.
          // (This can happen in fastforward mode.)
        }
        if (g_rendered_frames.length > 3) {
          // Frame rendering running behing, dropping one frame
          g_rendered_frames.shift(); // and throw it away
        }
      }
      break;
  }
};

let rom;

document
  .getElementById("file")
  .addEventListener("change", load_cartridge_from_file);
let lastRom = localStorage.getItem("lastRom");
if (lastRom) {
  rom = localStorage
    .getItem("lastRom")
    .split(",")
    .map((x) => parseInt(x));
}

let g_rendered_frames = [];

function renderLoop() {
  if (g_rendered_frames.length > 0) {
    for (let panel of g_rendered_frames.shift()) {
      const typed_pixels = new Uint8ClampedArray(panel.image_buffer);
      // TODO: don't hard-code the panel size here
      let rendered_frame = new ImageData(
        typed_pixels,
        panel.width,
        panel.height
      );

      let ctx = canvas.getContext("2d", { alpha: false });
      ctx.putImageData(rendered_frame, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
  }

  requestAnimationFrame(renderLoop);
}

function load_cartridge_from_file(e) {
  var file = e.target.files[0];
  if (!file) {
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    rom = new Uint8Array(e.target.result);
    localStorage.setItem("lastRom", rom);
    load_cartridge(rom);
    cartridgeInserted = true;
    setTimeout(startEmulation, 500);
  };
  reader.readAsArrayBuffer(file);

  // we're done with the file loader; unfocus it, so keystrokes are captured
  // by the game instead
  canvas.focus();
}

async function load_cartridge(cart_data) {
  console.log("Attempting to load cart with length: ", cart_data.length);
  emulatorWorker.postMessage({
    type: "rpc",
    func: "LoadCartridge",
    args: [cart_data],
  });
}

function handle_audio_message(e) {
  if (e.data.type == "samplesPlayed") {
    g_audio_samples_buffered -= e.data.count;
  }
}

function sync_to_audio() {
  // On mobile browsers, sometimes window.setTimeout isn't called often enough to reliably
  // queue up single frames; try to catch up by up to 4 of them at once.
  for (let i = 0; i < 4; i++) {
    // Never, for any reason, request more than 10 frames at a time. This prevents
    // the message queue from getting flooded if the emulator can't keep up.
    if (g_pending_frames < 10) {
      const actual_samples = g_audio_samples_buffered;
      const pending_samples = g_pending_frames * g_last_frame_sample_count;
      if (actual_samples + pending_samples < g_new_frame_sample_threshold) {
        requestFrame();
      }
    }
  }
  window.setTimeout(sync_to_audio, 1);
}

function requestFrame() {
  let nextBuffer = g_screen_buffers[g_next_free_buffer_index];
  if (nextBuffer) {
    g_next_free_buffer_index++;
    g_pending_frames++;
    nextBuffer = new ArrayBuffer(256 * 240 * 4);
    bufferCreated++;
    
    emulatorWorker.postMessage(
      {
        type: "requestFrame",
        p1: keys[1],
        p2: p2Input[2],
        panels: [
          {
            id: "screen",
            target_element: "#pixels",
            dest_buffer: nextBuffer,
          },
        ],
      },
      [nextBuffer]
    );
  }
  if (g_next_free_buffer_index >= g_total_buffers) {
    g_next_free_buffer_index = 0;
  }
}

async function audioInit() {
  const audioConfig = await config.initAudioContext();
  audioNode = audioConfig.audioNode;
  audioContext = audioConfig.context;
  audioNode.port.onmessage = handle_audio_message;
}

function startEmulation() {
  audioInit();
  sync_to_audio();
  frameLoop();
  renderLoop();
}

function frameLoop() {
  //do not request more than 10 frames
  //requsting more than required frame slows down the whole emulation
  if (g_pending_frames < 10) {
    requestFrame();
  }
  setTimeout(frameLoop, 1);
}

audioInit();


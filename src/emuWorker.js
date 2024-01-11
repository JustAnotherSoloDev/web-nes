importScripts("./rusticnes_wasm.js");

const {
  wasm_init,
  load_rom,
  run_until_vblank,
  set_p1_input,
  set_p2_input,
  set_audio_samplerate,
  set_audio_buffersize,
  audio_buffer_full,
  get_audio_buffer,
  get_sram,
  set_sram,
  has_sram,
  update_windows,
  draw_piano_roll_window,
  draw_screen_pixels,
  piano_roll_window_click,
  consume_audio_samples,
} = wasm_bindgen;

function load_cartridge(cart_data) {
  console.log(cart_data);
  load_rom(cart_data);
  set_audio_samplerate(44100);
}

function run_one_frame() {
  run_until_vblank();
  update_windows();
}

const rpcFunctions = {
  LoadCartridge: load_cartridge,
};

function get_screen_pixels(dest_array_buffer) {
  //let raw_buffer = new ArrayBuffer(256*240*4);
  //let screen_pixels = new Uint8ClampedArray(raw_buffer);
  let screen_pixels = new Uint8ClampedArray(dest_array_buffer);
  draw_screen_pixels(screen_pixels);
  return dest_array_buffer;
}

function rpc(type, args) {
  let fnToBeExecuted = rpcFunctions[type];
  if (fnToBeExecuted) {
    console.log("Executing RPC ", type);
    fnToBeExecuted(...args);
  }
}

function handle_message(e) {
  if (e.data.type == "rpc") {
    rpc(e.data.func, e.data.args);
  }
  if (e.data.type == "requestFrame") {
    // Run one step of the emulator
    set_p1_input(e.data.p1);
    set_p2_input(e.data.p2);
    if (e.data.p1 > 0) {
      console.log(e.data.p1);
    }
    run_one_frame();

    let outputPanels = [];
    let transferrableBuffers = [];
    for (let panel of e.data.panels) {
      if (panel.id == "screen") {
        let image_buffer = get_screen_pixels(panel.dest_buffer);
        outputPanels.push({
          id: "screen",
          target_element: panel.target_element,
          image_buffer: image_buffer,
          width: 256,
          height: 240,
        });
        transferrableBuffers.push(image_buffer);
      }
      if (panel.id == "piano_roll_window") {
        let image_buffer = get_piano_roll_pixels(panel.dest_buffer);
        outputPanels.push({
          id: "piano_roll_window",
          target_element: panel.target_element,
          image_buffer: image_buffer,
          width: 480,
          height: 270,
        });
        transferrableBuffers.push(image_buffer);
      }
    }

    let audio_buffer = consume_audio_samples();
    postMessage(
      {
        type: "deliverFrame",
        panels: outputPanels,
        audio_buffer: audio_buffer,
      },
      transferrableBuffers
    );
  }
}

worker_init = function () {
  wasm_init();
  // We are ready to go! Tell the main thread it can kick off execution
  initialized = true;
  postMessage({ type: "init" });
  self.onmessage = handle_message;
};

wasm_bindgen("./rusticnes_wasm_bg.wasm").then(worker_init);

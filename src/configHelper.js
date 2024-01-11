export function init() {
  document
    .getElementById("file")
    .addEventListener("change", load_cartridge_from_file);
}

export async function initAudioContext() {
  let context = new AudioContext({
    latencyHint: "interactive",
    sampleRate: 44100,
  });
  await context.audioWorklet.addModule("audioProcessor.js");
  let audioNode = new AudioWorkletNode(context, "nes-audio-processor");
  audioNode.connect(context.destination);
  audioNode.port.onmessage=(e)=>{
    console.log(e);
  }
  return { context, audioNode };
}

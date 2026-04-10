import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# Add mode to SftParsedConfig
audio_interface = """
  audio: {
    mode: "visual" | "audiovisual";
    waveform: OscillatorType;
"""
content = re.sub(r'\n  audio: \{\n    waveform: OscillatorType;', audio_interface, content)


# Add mode parsing
audio_parsing = """
  const stimulusAudioRaw = asObject(stimulusRaw?.audio);
  const audioMode = (asString(stimulusAudioRaw?.mode) || "visual").toLowerCase() === "audiovisual" ? "audiovisual" : "visual";
  const audio = {
    mode: audioMode as "visual" | "audiovisual",
    waveform: (asString(stimulusAudioRaw?.waveform) || "sine") as OscillatorType,"""
content = re.sub(r'\n  const stimulusAudioRaw = asObject\(stimulusRaw\?\.audio\);\n  const audio = \{\n    waveform: \(asString\(stimulusAudioRaw\?\.waveform\) \|\| "sine"\) as OscillatorType,', audio_parsing, content)


# Update dotsFromStimCode to not draw the second dot if audiovisual
# First, pass config to dotsFromStimCode or just use mode
content = re.sub(r'const dots = dotsFromStimCode\(trial\.stimCode, trial\.salience\);', r'const dots = dotsFromStimCode(trial.stimCode, trial.salience, config.audio.mode);', content)

# Then update dotsFromStimCode function
dots_func = """function dotsFromStimCode(stimCode: string, salience: { high: number; low: number }, mode: "visual" | "audiovisual"): Array<{ loc: "A" | "B"; luminance: number }> {
  const [a, b] = normalizeStimCode(stimCode).split("");
  const dots: Array<{ loc: "A" | "B"; luminance: number }> = [];
  if (a !== "x") dots.push({ loc: "A", luminance: a === "H" ? salience.high : salience.low });
  if (mode === "visual" && b !== "x") dots.push({ loc: "B", luminance: b === "H" ? salience.high : salience.low });
  return dots;
}"""
content = re.sub(r'function dotsFromStimCode\(stimCode: string, salience: \{ high: number; low: number \}\): Array<\{ loc: "A" \| "B"; luminance: number \}> \{\n  const \[a, b\] = normalizeStimCode\(stimCode\)\.split\(""\);\n  const dots: Array<\{ loc: "A" \| "B"; luminance: number \}> = \[\];\n  if \(a !== "x"\) dots\.push\(\{ loc: "A", luminance: a === "H" \? salience\.high : salience\.low \}\);\n  if \(b !== "x"\) dots\.push\(\{ loc: "B", luminance: b === "H" \? salience\.high : salience\.low \}\);\n  return dots;\n\}', dots_func, content)


with open(file_path, "w") as f:
    f.write(content)

print("Patched audio mode")

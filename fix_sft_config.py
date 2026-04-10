import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# Fix interface: find the end of interface SftParsedConfig and insert audio before it
# Revert previous replacement first
content = re.sub(r'  audio: \{\n    waveform: OscillatorType;\n    frequencyHz: number;\n    durationMs: number;\n    volume: number;\n  \};\n', '', content)

# Correctly insert audio into SftParsedConfig
sft_parsed_config_re = r'(interface SftParsedConfig \{[^}]+\n  display: \{[^}]+\};)'
audio_interface = """
  audio: {
    waveform: OscillatorType;
    frequencyHz: number;
    durationMs: number;
    volume: number;
  };"""
content = re.sub(sft_parsed_config_re, r'\1' + audio_interface, content)

# Fix parseSftConfig audio parsing placement
content = re.sub(r'\n  const stimulusAudioRaw = asObject\(stimulusRaw\?\.audio\);\n  const audio = \{\n    waveform: \(asString\(stimulusAudioRaw\?\.waveform\) \|\| "sine"\) as OscillatorType,\n    frequencyHz: toPositiveNumber\(stimulusAudioRaw\?\.frequencyHz \?\? stimulusAudioRaw\?\.frequency_hz, 440\),\n    durationMs: toPositiveNumber\(stimulusAudioRaw\?\.durationMs \?\? stimulusAudioRaw\?\.duration_ms, legacyTiming\.stimulusMs\),\n    volume: toUnitNumber\(stimulusAudioRaw\?\.volume, 0\.25\),\n  \};\n', '', content)

audio_parsing = """
  const stimulusAudioRaw = asObject(stimulusRaw?.audio);
  const audio = {
    waveform: (asString(stimulusAudioRaw?.waveform) || "sine") as OscillatorType,
    frequencyHz: toPositiveNumber(stimulusAudioRaw?.frequencyHz ?? stimulusAudioRaw?.frequency_hz, 440),
    durationMs: toPositiveNumber(stimulusAudioRaw?.durationMs ?? stimulusAudioRaw?.duration_ms, legacyTiming.stimulusMs),
    volume: toUnitNumber(stimulusAudioRaw?.volume, 0.25),
  };
"""

content = re.sub(r'(const legacyTiming = \{[^}]+\};)', r'\1' + audio_parsing, content)


with open(file_path, "w") as f:
    f.write(content)

print("Fixed SFT Config")

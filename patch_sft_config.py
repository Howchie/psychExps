import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# 1. Update SftParsedConfig interface
interface_addition = """  audio: {
    waveform: OscillatorType;
    frequencyHz: number;
    durationMs: number;
    volume: number;
  };
"""
content = re.sub(r'(interface SftParsedConfig \{[^\}]+display: \{[^\}]+\};)', r'\1\n' + interface_addition, content)

# 2. Update parseSftConfig function
audio_parsing_addition = """
  const stimulusAudioRaw = asObject(stimulusRaw?.audio);
  const audio = {
    waveform: (asString(stimulusAudioRaw?.waveform) || "sine") as OscillatorType,
    frequencyHz: toPositiveNumber(stimulusAudioRaw?.frequencyHz ?? stimulusAudioRaw?.frequency_hz, 440),
    durationMs: toPositiveNumber(stimulusAudioRaw?.durationMs ?? stimulusAudioRaw?.duration_ms, legacyTiming.stimulusMs),
    volume: toUnitNumber(stimulusAudioRaw?.volume, 0.25),
  };
"""
content = re.sub(r'(const legacyTiming = \{)', audio_parsing_addition + r'\n  \1', content)

# 3. Add to return object of parseSftConfig
return_addition = """    audio,
"""
content = re.sub(r'(display: \{[^\}]+\},)', r'\1\n' + return_addition, content)

with open(file_path, "w") as f:
    f.write(content)

print("Patched SFT Config successfully")

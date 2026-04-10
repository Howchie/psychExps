import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# Add audio to SftParsedConfig
audio_interface = """
  audio: {
    waveform: OscillatorType;
    frequencyHz: number;
    durationMs: number;
    volume: number;
  };"""

sft_parsed_config_re = r'(interface SftParsedConfig \{.*?\ndisplay: \{.*?\};)'

# Instead of using regex for adding the interface which seems tricky, let's just use string replace.
lines = content.split('\n')
for i, line in enumerate(lines):
    if "  display: {" in line and "SftParsedConfig" in "\n".join(lines[max(0, i-20):i]):
        # Check if we already have it
        if "audio: {" not in "\n".join(lines[i:i+20]):
            lines.insert(i, "  audio: {\n    waveform: OscillatorType;\n    frequencyHz: number;\n    durationMs: number;\n    volume: number;\n  };")
            break

content = "\n".join(lines)
with open(file_path, "w") as f:
    f.write(content)

print("Fixed SFT Config 2")

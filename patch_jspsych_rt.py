import re

file_path = "packages/core/src/engines/jspsychRtTask.ts"
with open(file_path, "r") as f:
    content = f.read()

# Add onStimulusPhaseStart to JsPsychRtTimelineConfig
config_addition = """  onResponse?: (response: { key: string | null; rtMs: number | null }, data: Record<string, unknown>) => void;
  onStimulusPhaseStart?: () => void;
"""
content = re.sub(r'  onResponse\?: \(response: \{ key: string \| null; rtMs: number \| null \}, data: Record<string, unknown>\) => void;\n', config_addition, content)

# Add onStimulusPhaseStart extraction
destructure_addition = """    postResponseContent = "stimulus",
    onResponse,
    onStimulusPhaseStart,
"""
content = re.sub(r'    postResponseContent = "stimulus",\n    onResponse,\n', destructure_addition, content)


# Add on_start callback to response segments
on_start_addition = """
      data: { ...baseData, phase: segment.phase },
      on_start: () => {
        if (segment.showStimulus && onStimulusPhaseStart && !responseSeen) {
          onStimulusPhaseStart();
        }
      },
      on_finish: (data: Record<string, unknown>) => {"""

content = re.sub(r'\n      data: \{ \.\.\.baseData, phase: segment\.phase \},\n      on_finish: \(data: Record<string, unknown>\) => \{', on_start_addition, content)


with open(file_path, "w") as f:
    f.write(content)

print("Patched jsPsychRtTask successfully")

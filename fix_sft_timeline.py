import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# I messed up the regex substitution for appendDotTrialTimeline.
# It added the onStimulusPhaseStart inside the argument object of appendDotTrialTimeline instead of buildJsPsychRtTimelineNodes.
# Let's clean it up and add it correctly.

# The bad part was inserted at the end of the appendDotTrialTimeline object in runTrial. Let's revert and do it right.

content = re.sub(r'    onStimulusPhaseStart: \(\) => \{\n      const trial = trialProvider\(\);\n.*?\n    \},\n    onResponse:', '    onResponse:', content, flags=re.DOTALL)

# Let's manually replace it inside buildJsPsychRtTimelineNodes

on_stim_start = """    postResponseContent: config.rtTask.enabled ? config.rtTask.postResponseContent : "stimulus",
    onStimulusPhaseStart: () => {
      const trial = trialProvider();
      if (!trial || !audioService) return;
      let targetSalience = 0;
      const code = trial.stimCode;
      if (code.length === 2) {
          const audioChar = code[1]; // Assume channel 2 is audio
          if (audioChar === 'H') targetSalience = trial.salience.high;
          else if (audioChar === 'L') targetSalience = trial.salience.low;
          else if (audioChar === 'x') targetSalience = 0;
          else targetSalience = trial.salience.high; // fallback
      } else {
         targetSalience = trial.salience.high;
      }

      if (targetSalience > 0) {
         const baseVol = config.audio.volume;
         const vol = baseVol * targetSalience;
         audioService.playTone(config.audio.frequencyHz, config.audio.durationMs, {
             waveform: config.audio.waveform,
             volume: vol
         });
      }
    },
    onResponse: (response: { key: string | null; rtMs: number | null }, data: Record<string, unknown>) => {"""

content = re.sub(r'    postResponseContent: config.rtTask.enabled \? config.rtTask.postResponseContent : "stimulus",\n    onResponse: \(response: \{ key: string \| null; rtMs: number \| null \}, data: Record<string, unknown>\) => \{', on_stim_start, content)


with open(file_path, "w") as f:
    f.write(content)

print("Fixed SFT Timeline")

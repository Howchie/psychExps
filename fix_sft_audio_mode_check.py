import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# Fix the missing mode check in appendDotTrialTimeline

on_stim_start = """    postResponseContent: config.rtTask.enabled ? config.rtTask.postResponseContent : "stimulus",
    onStimulusPhaseStart: () => {
      const trial = trialProvider();
      if (!trial || !audioService || config.audio.mode !== "audiovisual") return;
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

content = re.sub(r'    postResponseContent: config\.rtTask\.enabled \? config\.rtTask\.postResponseContent : "stimulus",\n    onStimulusPhaseStart: \(\) => \{\n      const trial = trialProvider\(\);\n      if \(!trial \|\| !audioService\) return;\n      let targetSalience = 0;\n      const code = trial\.stimCode;\n      if \(code\.length === 2\) \{\n          const audioChar = code\[1\]; // Assume channel 2 is audio\n          if \(audioChar === \'H\'\) targetSalience = trial\.salience\.high;\n          else if \(audioChar === \'L\'\) targetSalience = trial\.salience\.low;\n          else if \(audioChar === \'x\'\) targetSalience = 0;\n          else targetSalience = trial\.salience\.high; // fallback\n      \} else \{\n         targetSalience = trial\.salience\.high;\n      \}\n      \n      if \(targetSalience > 0\) \{\n         const baseVol = config\.audio\.volume;\n         const vol = baseVol \* targetSalience;\n         audioService\.playTone\(config\.audio\.frequencyHz, config\.audio\.durationMs, \{\n             waveform: config\.audio\.waveform,\n             volume: vol\n         \}\);\n      \}\n    \},\n    onResponse: \(response: \{ key: string \| null; rtMs: number \| null \}, data: Record<string, unknown>\) => \{', on_stim_start, content)


with open(file_path, "w") as f:
    f.write(content)

print("Fixed audio mode check")

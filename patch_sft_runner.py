import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# Instantiate AudioService in runSftTask
audio_service_instantiation = """
  let jsPsych: ReturnType<typeof initStandardJsPsych> | null = null;
  const audioService = new AudioService();
  const orchestrator = new TaskOrchestrator<PlannedBlock, PlannedTrial, TrialRecord>(context);
"""
content = re.sub(r'\n  let jsPsych: ReturnType<typeof initStandardJsPsych> \| null = null;\n  const orchestrator = new TaskOrchestrator<PlannedBlock, PlannedTrial, TrialRecord>\(context\);\n', audio_service_instantiation, content)

# Pass audioService to appendStaircaseTimeline
staircase_audio = """          timeline: staircaseTimeline,
          container: root,
          config: parsed,
          audioService,
"""
content = re.sub(r'          timeline: staircaseTimeline,\n          container: root,\n          config: parsed,\n', staircase_audio, content)

# Update appendStaircaseTimeline args
append_staircase_args = """function appendStaircaseTimeline(args: {
  timeline: any[];
  container: HTMLElement;
  config: SftParsedConfig;
  audioService?: AudioService;
"""
content = re.sub(r'function appendStaircaseTimeline\(args: \{\n  timeline: any\[\];\n  container: HTMLElement;\n  config: SftParsedConfig;\n', append_staircase_args, content)

# Destructure audioService in appendStaircaseTimeline
staircase_destructure = """  const { timeline, container, config, audioService, rng, allowedKeys, staircaseRecords, eventLogger } = args;"""
content = re.sub(r'  const \{ timeline, container, config, rng, allowedKeys, staircaseRecords, eventLogger \} = args;', staircase_destructure, content)

# Pass audioService to appendDotTrialTimeline in appendStaircaseTimeline
staircase_dot_audio = """    appendDotTrialTimeline({
      timeline,
      config,
      audioService,
"""
content = re.sub(r'    appendDotTrialTimeline\(\{\n      timeline,\n      config,\n', staircase_dot_audio, content)

# Pass audioService to appendDotTrialTimeline in runTrial
run_trial_audio = """        appendDotTrialTimeline({
          timeline: trialTimeline,
          config: parsed,
          audioService,
"""
content = re.sub(r'        appendDotTrialTimeline\(\{\n          timeline: trialTimeline,\n          config: parsed,\n', run_trial_audio, content)

# Clean up audioService on task complete
on_dispose = """      };
    },
    renderInstruction: createInstructionRenderer({"""
content = re.sub(r'      \};\n    \},\n    renderInstruction: createInstructionRenderer\(\{', on_dispose, content)

# Actually, TaskOrchestrator doesn't have an onDispose hook, let's just make sure it disposes when we're done. Wait, TaskAdapter context might have dispose but JS GC will handle it mostly. The AudioService class does have a dispose method, let's add it to a try/finally block around orchestrator.run() or similar.
# Alternatively, we can add it to getTaskMetadata which is called at the end.
get_metadata_addition = """    getTaskMetadata: (sessionResult) => {
      audioService.dispose();
"""
content = re.sub(r'    getTaskMetadata: \(sessionResult\) => \{\n', get_metadata_addition, content)


with open(file_path, "w") as f:
    f.write(content)

print("Patched SFT Runner")

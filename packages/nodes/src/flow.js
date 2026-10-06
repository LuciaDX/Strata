export const start = {
  type: "start",
  start: true,
  title: "Start",
  icon: "play",
  category: "Flow",
  description: "Where a run begins. Steps run in the order the white chain visits them",
  outputs: {
    then: "exec",
  },
  async run() {
    return {};
  },
};

export const sequence = {
  type: "sequence",
  title: "Sequence",
  icon: "sequence",
  category: "Flow",
  description: "Runs each white output in turn, finishing one branch before starting the next. Connecting the last output adds another",
  growOutputs: "then",
  outputs: {
    then1: "exec",
  },
  async run() {
    return {};
  },
};

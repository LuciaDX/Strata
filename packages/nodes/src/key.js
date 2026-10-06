import { KEY_MODES, Key } from "./formats/keys.js";

export const keyNode = {
  type: "key",
  pure: true,
  title: "Key",
  icon: "key",
  category: "Input",
  description: "A hash or encryption key. Text keys are typed as they are; symbols keys are random bytes like the Java packtool made, typed and written out as hex",
  outputs: {
    key: "key",
  },
  params: {
    mode: { type: "choice", options: KEY_MODES, default: "text" },
    key: { type: "key", required: true },
  },
  async run({ params, context }) {
    const key = new Key(params.mode, params.key);
    context.log(`${key.mode} key, ${key.bytes.length} bytes`);
    return { key };
  },
};

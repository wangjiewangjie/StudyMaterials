// afterPack：asar integrity 写入之后再 rcedit 会破坏校验或报 Unable to commit。
// 图标只在 afterExtract 阶段写入（见 after-extract.js）。

exports.default = async function afterPack() {
  // no-op
};

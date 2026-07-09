const startTimer = () => process.hrtime.bigint();

const getElapsedMs = (start) => Number(process.hrtime.bigint() - start) / 1e6;

const roundMs = (value) => Math.round(value * 100) / 100;

module.exports = {
  startTimer,
  getElapsedMs,
  roundMs
};

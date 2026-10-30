// For isolated integration tests only; never load this into a deployed server.
const NativeDate = Date;
const fixed = NativeDate.parse(process.env.TEST_CLOCK || "2026-11-04T12:00:00Z");
global.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [fixed])); }
  static now() { return fixed; }
  static parse(value) { return NativeDate.parse(value); }
  static UTC(...args) { return NativeDate.UTC(...args); }
};


//#region src/helpers/types.ts
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

//#endregion
exports.isRecord = isRecord;
//# sourceMappingURL=types.cjs.map
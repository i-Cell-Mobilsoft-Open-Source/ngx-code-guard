"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const schematics_1 = require("@angular-devkit/schematics");
// import { codeGuard } from '../codeguard';
function ngNew(options) {
    return () => {
        return schematics_1.chain([
            schematics_1.mergeWith(schematics_1.apply(schematics_1.empty(), [
                schematics_1.externalSchematic('@schematics/angular', 'ng-new', Object.assign({}, options)),
                schematics_1.schematic('codeguard', Object.assign(Object.assign({}, options), { overwrite: true, new: true }))
            ]))
        ]);
    };
}
exports.ngNew = ngNew;
//# sourceMappingURL=index.js.map
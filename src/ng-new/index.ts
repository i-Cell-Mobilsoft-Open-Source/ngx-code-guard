import { Rule, chain, externalSchematic, schematic, mergeWith, apply, empty } from '@angular-devkit/schematics';
// import { codeGuard } from '../codeguard';

export function ngNew(options: any): Rule {
  return () => {
    console.log(options)
    return chain([
      mergeWith(apply(empty(), [
        externalSchematic('@schematics/angular', 'ng-new', { ...options }),
        schematic('codeguard', { ...options, ...{ overwrite: true, new: true } })
      ])
      )])
  };
}

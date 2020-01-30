import { Rule, chain, externalSchematic, schematic, mergeWith, apply, empty } from '@angular-devkit/schematics';

export function ngNew(options: any): Rule {
  return () => {
    return chain([
      mergeWith(apply(empty(), [
        externalSchematic('@schematics/angular', 'ng-new', { ...options }),
        schematic('codeguard', { ...options, ...{ overwrite: true, new: true } })
      ])
      )])
  };
}

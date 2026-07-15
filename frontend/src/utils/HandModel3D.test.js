import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAmputationSettingsForSide } from './HandModel3D.js';

test('resolveAmputationSettingsForSide uses per-side bilateral settings', () => {
    const configRef = {
        current: {
            amputationSide: 'BILATERAL',
            leftAmputationLevel: 'WRIST_DISARTICULATION',
            rightAmputationLevel: 'BELOW_ELBOW',
            leftMissingFingers: ['THUMB'],
            rightMissingFingers: ['INDEX'],
        },
    };

    assert.deepEqual(resolveAmputationSettingsForSide(configRef, 'LEFT'), {
        level: 'WRIST',
        missingFingers: ['THUMB'],
    });

    assert.deepEqual(resolveAmputationSettingsForSide(configRef, 'RIGHT'), {
        level: 'BELOW_ELBOW',
        missingFingers: ['INDEX'],
    });
});

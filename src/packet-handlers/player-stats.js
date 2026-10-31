const Utility = require('../utility');
const serverOpcodes = require('../opcodes/server');

module.exports = {
    [serverOpcodes.PLAYER_STAT_LIST]: function (data) {
        // A complete list is a login/reconnect baseline, never an XP award.
        if (this.resetStatusOverlay) this.resetStatusOverlay();
        let offset = 1;

        for (let i = 0; i < this.playerStatCurrent.length; i++) {
            this.playerStatCurrent[i] = Utility.getUnsignedByte(data[offset++]);
        }

        for (let i = 0; i < this.playerStatBase.length; i++) {
            this.playerStatBase[i] = Utility.getUnsignedByte(data[offset++]);
        }

        for (let i = 0; i < this.playerExperience.length; i++) {
            this.playerExperience[i] = Utility.getUnsignedInt(data, offset);
            offset += 4;
        }

        this.playerQuestPoints = Utility.getUnsignedByte(data[offset++]);
        this.experienceBaselineReady = true;
    },
    [serverOpcodes.PLAYER_STAT_EQUIPMENT_BONUS]: function (data) {
        for (let i = 0; i < this.playerStatEquipment.length; i++) {
            this.playerStatEquipment[i] = Utility.getUnsignedByte(data[1 + i]);
        }
    },
    [serverOpcodes.PLAYER_STAT_EXPERIENCE_UPDATE]: function (data) {
        const skillIndex = data[1] & 0xff;
        const oldExperience = this.playerExperience[skillIndex];
        this.playerExperience[skillIndex] = Utility.getUnsignedInt(data, 2);
        if (this.experienceBaselineReady && this.recordExperienceChange) {
            this.recordExperienceChange(skillIndex, oldExperience, this.playerExperience[skillIndex]);
        }
    },
    [serverOpcodes.PLAYER_STAT_UPDATE]: function (data) {
        let offset = 1;

        const skillIndex = data[offset++] & 0xff;
        const oldExperience = this.playerExperience[skillIndex];

        this.playerStatCurrent[skillIndex] = Utility.getUnsignedByte(
            data[offset++]
        );

        this.playerStatBase[skillIndex] = Utility.getUnsignedByte(
            data[offset++]
        );

        this.playerExperience[skillIndex] = Utility.getUnsignedInt(
            data,
            offset
        );
        if (this.experienceBaselineReady && this.recordExperienceChange) {
            this.recordExperienceChange(skillIndex, oldExperience, this.playerExperience[skillIndex]);
        }

        // TODO probably don't need this
        offset += 4;
    },
    [serverOpcodes.PLAYER_STAT_FATIGUE]: function (data) {
        this.statFatigue = Utility.getUnsignedShort(data, 1);
    },
    [serverOpcodes.PLAYER_QUEST_LIST]: function (data) {
        for (let i = 0; i < this.questComplete.length; i++) {
            this.questComplete[i] = !!data[i + 1];
        }
    }
};

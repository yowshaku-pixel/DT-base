import { MaintenanceRecord } from '../types';
import { normalizeDate } from '../lib/utils';

export interface AuditCategory {
  id: string;
  label: string;
  warningMonths: number;
  criticalMonths?: number;
  match: (s: string) => boolean;
  color: string;
}

export const AUDIT_CATEGORIES: AuditCategory[] = [
  { 
    id: 'oil', 
    label: 'Oil Service', 
    warningMonths: 6,
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;]|\.\s+|, (?=note|service|start|i{1,3}\))/i);
      return items.some(item => {
        const hasOil = /oil|o\.l|o\/l/i.test(item);
        const hasServiceKeywords = /service|change|changed|total/i.test(item);
        const isEngineOilService = /engine\s*(oil|o\.l)/i.test(item) && !/check|leak|top-up|top\s*up/i.test(item);
        const isExcluded = /top-up|top\s*up|leak|diff|gear|seal|cooler/i.test(item);
        const isCheckRequest = /check/i.test(item) && !/service|change|changed|total|\d{3,}/.test(item);
        return hasOil && (hasServiceKeywords || isEngineOilService) && !isExcluded && !isCheckRequest;
      });
    },
    color: 'amber'
  },
  { 
    id: 'brake_front', 
    label: 'Brake Pads Front', 
    warningMonths: 5,
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;,]|\.\s+/);
      return items.some(item => {
        const hasFront = /front|axel\s*1/i.test(item);
        const hasBoth = /front\s*(and|&)\s*diff/i.test(item);
        const hasPad = /(bra|bre)ak\s*pad|pad/i.test(item);
        const isDiscOnly = /(disc|disk|rotor)/i.test(item) && !/(bra|bre)ak\s*pad|pad/i.test(item);
        return (hasFront || hasBoth) && hasPad && !isDiscOnly;
      });
    },
    color: 'cyan'
  },
  { 
    id: 'brake_diff', 
    label: 'Brake Pads Diff', 
    warningMonths: 5,
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;,]|\.\s+/);
      return items.some(item => {
        const hasDiff = /diff|differential|axel\s*2/i.test(item);
        const hasBoth = /front\s*(and|&)\s*diff/i.test(item);
        const hasPad = /(bra|bre)ak\s*pad|pad/i.test(item);
        const isDiscOnly = /(disc|disk|rotor)/i.test(item) && !/(bra|bre)ak\s*pad|pad/i.test(item);
        return (hasDiff || hasBoth) && hasPad && !isDiscOnly;
      });
    },
    color: 'blue'
  },
  { 
    id: 'lining', 
    label: 'Lining', 
    warningMonths: 12,
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;]|\.\s+/);
      return items.some(item => {
        const isLining = /(bra|bre)ak\s*lining|lining\s*(?!spring)|duroline|hamako|lonaflex|lina/i.test(item);
        const isSpring = /return\s*spring|lining\s*spring/i.test(item);
        return isLining && !isSpring;
      });
    },
    color: 'indigo'
  },
  { 
    id: 'eq_bush', 
    label: 'Equalizer Bush', 
    warningMonths: 10,
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;]|\.\s+/);
      return items.some(item => /equaliz?er.*(bush|ripper|pin|bolt|bipper)/i.test(item) || /eq.*bush/i.test(item));
    },
    color: 'violet'
  },
  { 
    id: 'ctrl_bush', 
    label: 'Control Arm Bushes', 
    warningMonths: 10,
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;]|\.\s+/);
      return items.some(item => /control\s*arm.*(bush|nut|pin|bolt|tight)/i.test(item) || /ctrl\s*arm/i.test(item) || /v-arm.*bush/i.test(item));
    },
    color: 'purple'
  },
  { 
    id: 'tierod_s', 
    label: 'Tierod Steering (S)', 
    warningMonths: 6,
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;]|\.\s+/);
      return items.some(item => /tierod\s*(small|steering)/i.test(item) || /stear?ing\s*tierod/i.test(item) || /rod\s*steering/i.test(item));
    },
    color: 'fuchsia'
  },
  { 
    id: 'tierod_b', 
    label: 'Tierod Big (Control)', 
    warningMonths: 6,
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;]|\.\s+/);
      return items.some(item => /tierod\s*(big|long|control)/i.test(item) || /control\s*tierod/i.test(item) || /rod\s*control/i.test(item));
    },
    color: 'pink'
  },
  { 
    id: 'battery', 
    label: 'Battery (New)', 
    warningMonths: 12, // Yellow after 1 year
    criticalMonths: 18, // Red after 18 months
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;]|\.\s+/);
      return items.some(item => {
        const hasBattery = /battery|batt/i.test(item);
        const hasNew = /new|replacement|replaced/i.test(item);
        const hasBrand = /k-vanity|white|kvanity/i.test(item);
        const hasSerial = /[A-Z]+\d{4,}/.test(item); // Simple SN pattern like SSD395H
        return hasBattery && (hasNew || hasBrand || hasSerial);
      });
    },
    color: 'teal'
  },
  { 
    id: 'battery_repair', 
    label: 'Battery Repair', 
    warningMonths: 3, // Red after 3 months
    criticalMonths: 3,
    match: (s: string) => {
      const items = s.toLowerCase().split(/[ivx\d]+\)|[\n;]|\.\s+/);
      return items.some(item => {
        const hasBattery = /battery|batt/i.test(item);
        const hasRepairKeywords = /repair|cell|post|terminal|repaired/i.test(item);
        const hasCondition = /second\s*hand|s\.hand|s-hand/i.test(item);
        return hasBattery && (hasRepairKeywords || hasCondition);
      });
    },
    color: 'blue'
  }
];

export const RED_MONTHS = 13;

export function calculateAuditStats(records: MaintenanceRecord[]) {
  // First, find the latest 'New Battery' record for this set of records (which are usually for one truck)
  const batteryCat = AUDIT_CATEGORIES.find(c => c.id === 'battery');
  const batteryMatches = records.filter(r => batteryCat?.match(r.service_description.toLowerCase()));
  
  const latestNewBattery = batteryMatches.length > 0 
    ? batteryMatches.sort((a, b) => {
        const dateA = new Date(normalizeDate(a.service_date)).getTime();
        const dateB = new Date(normalizeDate(b.service_date)).getTime();
        return dateB - dateA;
      })[0]
    : null;
  
  const latestNewBatteryTime = latestNewBattery ? new Date(normalizeDate(latestNewBattery.service_date)).getTime() : 0;

  return AUDIT_CATEGORIES.map(cat => {
    let matches = records.filter(r => {
      const desc = r.service_description.toLowerCase();
      return cat.match(desc);
    });

    // Special logic for Battery Repair: Only consider repairs AFTER the latest New Battery
    let noRepairAfterNew = false;
    if (cat.id === 'battery_repair' && latestNewBatteryTime > 0) {
      const allRepairs = [...matches];
      matches = matches.filter(r => {
        const repairDate = new Date(normalizeDate(r.service_date)).getTime();
        return repairDate > latestNewBatteryTime;
      });
      
      // If we had repairs but none are after the new battery
      if (allRepairs.length > 0 && matches.length === 0) {
        noRepairAfterNew = true;
      }
    }

    const latest = matches.length > 0 
      ? matches.sort((a, b) => {
          const dateA = new Date(normalizeDate(a.service_date)).getTime();
          const dateB = new Date(normalizeDate(b.service_date)).getTime();
          if (isNaN(dateA)) return 1;
          if (isNaN(dateB)) return -1;
          return dateB - dateA;
        })[0]
      : null;

    const now = new Date();
    const latestParsed = latest ? new Date(normalizeDate(latest.service_date)) : null;
    
    let diffMonths = 0;
    let isStale = false;
    let isCritical = false;
    let remainingPercent = 0;
    let timeAgo = '';

    if (latestParsed) {
      const diffMs = now.getTime() - latestParsed.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      diffMonths = Math.floor(diffDays / 30.44);
      
      const categoryCritical = cat.criticalMonths || RED_MONTHS;
      
      isStale = diffMonths >= cat.warningMonths;
      isCritical = diffMonths >= categoryCritical;
      
      remainingPercent = Math.max(0, Math.min(100, Math.round(((categoryCritical * 30.44 - diffDays) / (categoryCritical * 30.44)) * 100)));
      
      if (diffMonths === 0) {
        timeAgo = diffDays < 1 ? 'Today' : `${Math.floor(diffDays)} days ago`;
      } else {
        timeAgo = `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
      }
    } else {
      isCritical = true;
      if (noRepairAfterNew) {
        timeAgo = 'No repair after new';
      }
    }

    return {
      catId: cat.id,
      label: cat.label,
      latestDate: latest?.service_date || null,
      isStale,
      isCritical: noRepairAfterNew ? false : isCritical, // Don't mark as critical if we know it's "new"
      remainingPercent: noRepairAfterNew ? 100 : remainingPercent,
      timeAgo
    };
  });
}

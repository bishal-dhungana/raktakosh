export type BloodRequirementFilters = {
  bloodGroup?: string;
  rhFactor?: string;
  component?: string;
};

export function hasAnyBloodRequirement(filters: BloodRequirementFilters): boolean {
  return Boolean(filters.bloodGroup || filters.rhFactor || filters.component);
}

export function hasCompleteBloodRequirement(filters: BloodRequirementFilters): boolean {
  return Boolean(filters.bloodGroup && filters.rhFactor && filters.component);
}

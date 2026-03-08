/**
 * Thin hook wrapper — delegates to LoyaltyProgramsContext so all consumers
 * share a single programs state and a single refresh call cascades everywhere.
 */
export { useLoyaltyProgramsContext as useLoyaltyPrograms } from "../contexts/LoyaltyProgramsContext";

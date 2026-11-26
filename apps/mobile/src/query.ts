/*
 * Moved to @hypefy/core/query.
 *
 * The website hit the identical defect in November — a refused query and an
 * empty table being the same value — so the helper that refuses to discard
 * an error belongs where both clients can reach it. The doc explaining why,
 * and both incidents, lives with the code.
 *
 * Delete this file once every caller imports from @hypefy/core directly;
 * it exists so the move did not have to edit every loader at once.
 */
export * from "@hypefy/core/query";

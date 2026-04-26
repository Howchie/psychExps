#!/usr/bin/env Rscript

# Quick hold-duration calibration math for Bricks.
# Minimal model:
# - Uses hold-duration gain/dropoff parameters
# - Compares fixed-hold vs adaptive-final-hold time per brick
# - Computes simple clear-all feasibility for identical bricks under a trial time budget
#
# Example:
#   Rscript tasks/bricks/scripts/hold_sweep_quick.R \
#     --target-hold-ms=1000 --hold-floor-ms=100 --overshoot-tolerance-ms=500 \
#     --progress-per-perfect=0.27 --progress-curve=0.8 \
#     --width-px=50 --width-ref-px=50 --width-exp=1 \
#     --inter-click-ms=125 --acquire-ms=110 \
#     --n-bricks=4 --trial-ms=12000 \
#     --hold-ms=0,25,50,75,100,125,150,200,250,300,400,500,600,700,800,900,1000,1100,1200

args <- commandArgs(trailingOnly = TRUE)

defaults <- list(
  target_hold_ms = 1000,
  hold_floor_ms = 100,
  hold_ceiling_ms = 1500,
  progress_per_perfect = 0.3,
  progress_curve = 2.0,
  width_px = 50,
  width_ref_px = 50,
  width_exp = 1,
  inter_click_ms = 125,   # from measured click speed (8 cps => 125 ms)
  acquire_ms = 110,       # charged once per brick
  n_bricks = 4,
  trial_ms = 12000,
  hold_ms = seq(0, 1600, by = 50),
  output = ""
)

parse_kv <- function(x) {
  m <- regexec("^--([^=]+)=(.*)$", x)
  reg <- regmatches(x, m)[[1]]
  if (length(reg) != 3) return(NULL)
  list(key = reg[2], value = reg[3])
}

to_num <- function(x, fallback) {
  v <- suppressWarnings(as.numeric(x))
  if (is.na(v)) fallback else v
}

to_int <- function(x, fallback) {
  v <- suppressWarnings(as.integer(x))
  if (is.na(v)) fallback else v
}

cfg <- defaults
for (a in args) {
  kv <- parse_kv(a)
  if (is.null(kv)) next
  k <- gsub("-", "_", kv$key, fixed = FALSE)
  v <- kv$value
  if (!k %in% names(cfg)) next

  if (k == "hold_ms") {
    parts <- strsplit(v, ",", fixed = TRUE)[[1]]
    nums <- suppressWarnings(as.numeric(trimws(parts)))
    nums <- nums[is.finite(nums)]
    if (length(nums) > 0) cfg[[k]] <- sort(unique(round(nums)))
  } else if (k %in% c("n_bricks")) {
    cfg[[k]] <- to_int(v, cfg[[k]])
  } else if (k %in% c("output")) {
    cfg[[k]] <- v
  } else {
    cfg[[k]] <- to_num(v, cfg[[k]])
  }
}

# Support legacy param if ceiling not explicitly set via args
if (!is.null(cfg$overshoot_tolerance_ms) && is.null(cfg$hold_ceiling_ms)) {
  cfg$hold_ceiling_ms <- cfg$target_hold_ms + cfg$overshoot_tolerance_ms
}

clamp <- function(x, lo, hi) pmax(lo, pmin(hi, x))

width_factor <- function(width_px, width_ref_px, width_exp) {
  raw <- width_px / width_ref_px
  pmax(0.2, pmax(0.01, raw) ^ width_exp)
}

gain_per_hold <- function(hold_ms, cfg) {
  wf <- width_factor(cfg$width_px, cfg$width_ref_px, cfg$width_exp)
  
  if (hold_ms < cfg$hold_floor_ms || hold_ms > cfg$hold_ceiling_ms) {
    return(0)
  }
  
  ratio <- 0
  if (hold_ms < cfg$target_hold_ms) {
    range <- cfg$target_hold_ms - cfg$hold_floor_ms
    dist <- (cfg$target_hold_ms - hold_ms) / max(1, range)
    ratio <- 1 - clamp(dist, 0, 1)
  } else {
    range <- cfg$hold_ceiling_ms - cfg$target_hold_ms
    dist <- (hold_ms - cfg$target_hold_ms) / max(1, range)
    ratio <- 1 - clamp(dist, 0, 1)
  }
  
  gained_unscaled <- (ratio ^ cfg$progress_curve) * cfg$progress_per_perfect
  gained_unscaled / wf
}
tmp=NULL;for(i in cfg$hold_ms){tmp=c(tmp,gain_per_hold(i,cfg))}
plot(cfg$hold_ms,tmp,type='l')
required_hold_for_gain <- function(required_gain, cfg) {
  if (required_gain <= 0) return(0)
  
  # Search the under-side first (shortest time to reach gain)
  lo <- cfg$hold_floor_ms
  hi <- cfg$target_hold_ms
  
  # Check if peak is even enough
  if (gain_per_hold(cfg$target_hold_ms, cfg) < required_gain) return(Inf)
  
  for (i in 1:40) {
    mid <- (lo + hi) / 2
    if (gain_per_hold(mid, cfg) >= required_gain) hi <- mid else lo <- mid
  }
  hi
}

time_per_brick_fixed <- function(hold_ms, cfg) {
  g <- gain_per_hold(hold_ms, cfg)
  if (g <= 0) return(Inf)
  holds <- ceiling(1 / g)
  cfg$acquire_ms + holds * hold_ms + pmax(0, holds - 1) * cfg$inter_click_ms
}

time_per_brick_adaptive <- function(hold_ms, cfg) {
  g <- gain_per_hold(hold_ms, cfg)
  if (g <= 0) return(Inf)
  full_holds <- floor((1 - 1e-12) / g)
  progress_after_full <- full_holds * g
  remaining_gain <- pmax(0, 1 - progress_after_full)
  final_hold <- required_hold_for_gain(remaining_gain, cfg)
  if (!is.finite(final_hold)) return(Inf)
  total_holds <- full_holds + 1
  cfg$acquire_ms + full_holds * hold_ms + final_hold + pmax(0, total_holds - 1) * cfg$inter_click_ms
}

clear_all_possible <- function(time_per_brick, cfg) {
  is.finite(time_per_brick) && (cfg$n_bricks * time_per_brick <= cfg$trial_ms)
}

rows <- lapply(cfg$hold_ms, function(h) {
  g <- gain_per_hold(h, cfg)
  holds <- if (g > 0) ceiling(1 / g) else NA_integer_
  t_fix <- time_per_brick_fixed(h, cfg)
  t_adp <- time_per_brick_adaptive(h, cfg)
  data.frame(
    hold_ms = h,
    gain_per_hold = g,
    holds_to_clear = holds,
    time_per_brick_fixed_ms = t_fix,
    time_per_brick_adaptive_ms = t_adp,
    clear_all_fixed = clear_all_possible(t_fix, cfg),
    clear_all_adaptive = clear_all_possible(t_adp, cfg),
    stringsAsFactors = FALSE
  )
})

out <- do.call(rbind, rows)

if (!identical(cfg$output, "")) {
  write.csv(out, file = cfg$output, row.names = FALSE)
  cat(sprintf("Wrote: %s\n", cfg$output))
} else {
  print(out, row.names = FALSE)
}


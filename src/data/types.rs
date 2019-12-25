//! A simplified and normalized data model, with shared data referenced by ID.
//!
//! This doesn't include all of the metadata from speedrun.com, and excludes
//! corrupt records and rejected or pending runs.
#![allow(missing_docs)]
use std::convert::From;

use chrono::{DateTime, NaiveDate, Utc};
use getset::Getters;
#[allow(unused)] use log::{debug, error, info, trace, warn};
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError, ValidationErrors};
use validator_derive::Validate;

use crate::utils::{base36, src_slugify};

/// We currently represent all ids as NonZeroU64s for efficiency.
/// You can use [crate::utils] to convert to and from speedrun.com's
/// API IDs. (This isn't the same conversion as speedrun.com uses,
/// so the ordering of these IDs doesn't align with insertion time
/// or anything like that.)
pub type Id64 = std::num::NonZeroU64;

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    PartialEq,
    Hash,
    PartialOrd,
    Ord,
    Eq,
    Getters,
    Validate,
)]
#[serde(deny_unknown_fields)]
#[get = "pub"]
pub struct Category {
    pub game_id: Id64,
    #[validate(length(min = 1))]
    pub slug:    String,
    #[validate(length(min = 1))]
    pub name:    String,
    pub id:      Id64,
    pub per:     CategoryType,
    pub rules:   String,
}

impl Category {
    /// This item's ID as it would be formatted for SpeedRun.Com.
    pub fn src_id(&self) -> String {
        base36(*self.id())
    }

    /// This item's URL as it would be formatted for SpeedRun.com.
    pub fn src_slug(&self) -> String {
        src_slugify(self.name())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Hash, PartialOrd, Ord, Eq)]
#[serde(deny_unknown_fields)]
pub enum CategoryType {
    PerGame,
    PerLevel,
}

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    PartialEq,
    Hash,
    PartialOrd,
    Ord,
    Eq,
    Getters,
    Validate,
)]
#[serde(deny_unknown_fields)]
#[get = "pub"]
pub struct User {
    pub created: Option<DateTime<Utc>>,
    #[validate(length(min = 1))]
    pub slug:    String,
    #[validate(length(min = 1))]
    pub name:    String,
    pub id:      Id64,
}

impl User {
    /// This item's ID as it would be formatted for SpeedRun.Com.
    pub fn src_id(&self) -> String {
        base36(*self.id())
    }

    /// This item's URL as it would be formatted for SpeedRun.com.
    pub fn src_slug(&self) -> String {
        src_slugify(self.name())
    }
}

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    PartialEq,
    Hash,
    PartialOrd,
    Ord,
    Eq,
    Getters,
    Validate,
)]
#[serde(deny_unknown_fields)]
#[get = "pub"]
pub struct Game {
    pub id:             Id64,
    pub created:        Option<DateTime<Utc>>,
    #[validate(length(min = 1))]
    pub slug:           String,
    #[validate(length(min = 1))]
    pub src_slug:       String,
    #[validate(length(min = 1))]
    pub name:           String,
    pub primary_timing: TimingMethod,
}

impl Game {
    /// This item's ID as it would be formatted for SpeedRun.Com.
    pub fn src_id(&self) -> String {
        base36(*self.id())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Hash, PartialOrd, Ord, Eq)]
#[serde(deny_unknown_fields)]
#[allow(non_camel_case_types)]
pub enum TimingMethod {
    IGT,
    RTA,
    RTA_NL,
}

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    PartialEq,
    Hash,
    PartialOrd,
    Ord,
    Eq,
    Getters,
    Validate,
)]
#[serde(deny_unknown_fields)]
#[get = "pub"]
pub struct Level {
    pub game_id: Id64,
    pub id:      Id64,
    #[validate(length(min = 1))]
    pub slug:    String,
    #[validate(length(min = 1))]
    pub name:    String,
    pub rules:   String,
}

impl Level {
    /// This item's ID as it would be formatted for SpeedRun.Com.
    pub fn src_id(&self) -> String {
        base36(*self.id())
    }

    /// This item's URL as it would be formatted for SpeedRun.com.
    pub fn src_slug(&self) -> String {
        src_slugify(self.name())
    }
}

#[derive(
    Debug,
    Serialize,
    Deserialize,
    PartialEq,
    Hash,
    Clone,
    PartialOrd,
    Ord,
    Eq,
    Getters,
    Validate,
)]
#[serde(deny_unknown_fields)]
#[get = "pub"]
pub struct Run {
    pub game_id:     Id64,
    pub category_id: Id64,
    pub level_id:    Option<Id64>,
    pub id:          Id64,
    pub created:     Option<DateTime<Utc>>,
    pub date:        Option<NaiveDate>,
    #[validate]
    pub times_ms:    RunTimesMs,
    #[validate]
    pub players:     Vec<RunPlayer>,
}

impl Run {
    /// This item's ID as it would be formatted for SpeedRun.Com.
    pub fn src_id(&self) -> String {
        base36(*self.id())
    }
}

#[derive(
    Debug, Serialize, Deserialize, PartialEq, Hash, Clone, PartialOrd, Ord, Eq, Getters,
)]
#[serde(deny_unknown_fields)]
#[get = "pub"]
pub struct RunTimesMs {
    pub igt:    Option<u64>,
    pub rta:    Option<u64>,
    pub rta_nl: Option<u64>,
}

impl RunTimesMs {
    pub fn get(&self, timing: &TimingMethod) -> Option<u64> {
        match timing {
            TimingMethod::IGT => *self.igt(),
            TimingMethod::RTA => *self.rta(),
            TimingMethod::RTA_NL => *self.rta_nl(),
        }
    }
}

impl Validate for RunTimesMs {
    fn validate(&self) -> Result<(), ValidationErrors> {
        if self.igt == None && self.rta == None && self.rta_nl == None {
            let mut errors = ValidationErrors::new();
            errors.add("", ValidationError::new("all times were None"));
            return Err(errors)
        }
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Hash, PartialOrd, Ord, Eq)]
#[serde(deny_unknown_fields)]
pub enum RunPlayer {
    UserId(Id64),
    GuestName(String),
}

impl Validate for RunPlayer {
    fn validate(&self) -> Result<(), ValidationErrors> {
        if let RunPlayer::GuestName(name) = self {
            if name.is_empty() {
                let mut errors = ValidationErrors::new();
                errors.add("GuestName.0", ValidationError::new("name is empty"));
                return Err(errors)
            }
        }
        Ok(())
    }
}

use std::sync::Arc;

use juniper::{FieldError, FieldResult, RootNode};

#[allow(unused)]
use juniper::{
    graphql_interface, graphql_object, graphql_scalar, graphql_union, graphql_value,
    object, GraphQLEnum, GraphQLInputObject, GraphQLObject, GraphQLScalarValue,
    ScalarValue,
};

use crate::{data::database::Database, utils::base36};

#[derive(Debug)]
pub struct Context {
    pub database: Arc<Database>,
}
impl juniper::Context for Context {}

#[derive(Debug)]
pub struct Game {
    id: u64,
}

#[juniper::object(Context = Context)]
#[graphql(description = "A game on speedrun.com.")]
impl Game {
    #[graphql(description = "
        The game's base36 ID from speedrun.com.
    ")]
    pub fn id(&self, context: &Context) -> FieldResult<String> {
        Ok(base36(self.id))
    }

    #[graphql(description = "
        The game's name, international/english preferred.
    ")]
    pub fn name(&self, context: &Context) -> FieldResult<String> {
        let game = context.database.game_by_id(self.id).unwrap();
        Ok(game.name.to_string())
    }

    #[graphql(description = "
        The game's URL slug/abbreviation.
    ")]
    pub fn slug(&self, context: &Context) -> FieldResult<String> {
        let game = context.database.game_by_id(self.id).unwrap();
        Ok(game.slug.to_string())
    }

    #[graphql(description = "
        All of the runs submitted for this game.
    ")]
    pub fn runs(&self, context: &Context) -> FieldResult<Vec<Run>> {
        let runs = context.database.runs_by_game_id(self.id).unwrap();
        Ok(runs.iter().map(|run| Run { id: run.id }).collect())
    }
}

#[derive(Debug)]
pub struct Run {
    id: u64,
}

#[juniper::object(Context = Context)]
#[graphql(description = "A run of a game on speedrun.com.")]
impl Run {
    #[graphql(description = "
        The run's base36 ID from speedrun.com.
    ")]
    pub fn id(&self, context: &Context) -> FieldResult<String> {
        Ok(base36(self.id))
    }
}

#[derive(Debug, Default)]
pub struct Query {}

#[juniper::object(Context = Context)]
#[graphql(description = "
    Read-only operation root.
")]
impl Query {
    #[graphql(description = "
        Get a game by id or slug.
    ")]
    pub fn game(context: &Context, slug: String) -> FieldResult<Game> {
        match context.database.game_by_slug(&slug) {
            Some(game) => Ok(Game { id: game.id }),
            None => Err(FieldError::from("not found")),
        }
    }
}

#[derive(Debug, Default)]
pub struct Mutation {}

#[juniper::object(Context = Context)]
#[graphql(description = "
    Read-write operation root.
")]
impl Mutation {
    #[graphql(description = "No-op workaround for https://git.io/JeNXr.")]
    pub fn noop(context: &Context) -> FieldResult<bool> {
        Ok(false)
    }
}

pub type Schema = RootNode<'static, Query, Mutation>;

pub fn schema() -> Schema {
    Schema::new(Query {}, Mutation {})
}

//! Fetches/updates our local mirror of speedrun.com API content. This
//! just stores the JSON representation of each item as-is, it doesn't
//! make any assumptions about their structure beyond the existence of
//! a string "id" value.
use flate2::{read::GzDecoder, write::GzEncoder};
#[allow(unused)] use log::{debug, error, info, trace, warn};
use serde_json::{Deserializer as JsonDeserializer, Value as JsonValue};
use std::{
    collections::BTreeMap,
    fs::File,
    io::{prelude::*, BufReader, BufWriter},
};
use tempfile::NamedTempFile;

pub type BoxErr = Box<dyn std::error::Error>;

#[derive(PartialEq, Eq, Hash)]
struct Resource {
    id:    &'static str,
    order: &'static str,
    embed: &'static str,
}

const RESOURCES: [Resource; 3] = [
    Resource {
        id: "games",
        order: "created",
        embed: "levels,categories,variables,gametypes,platforms,regions,genres,engines,developers,publishers"
    },
    Resource {
        id: "users",
        order: "signup",
        embed: ""
    },
    Resource {
        id: "runs",
        order: "submitted",
        embed: ""
    },
];

#[derive(Default)]
struct Spider {
    games_by_id: BTreeMap<String, JsonValue>,
    users_by_id: BTreeMap<String, JsonValue>,
    runs_by_id:  BTreeMap<String, JsonValue>,
}

impl Spider {
    fn resource_by_id(&mut self, resource: &Resource) -> &mut BTreeMap<String, JsonValue> {
        match resource.id {
            "runs" => &mut self.runs_by_id,
            "games" => &mut self.games_by_id,
            "users" => &mut self.users_by_id,
            _ => unreachable!(),
        }
    }

    pub fn load_or_create() -> Self {
        let mut spider = Spider::default();

        let mut load = || -> Result<(), Box<dyn std::error::Error>> {
            for resource in RESOURCES.iter() {
                info!("Loading {}...", resource.id);
                let file = File::open(&format!("data/api/{}.jsonl.gz", resource.id))?;
                let buffer = BufReader::new(&file);
                let decompressor = GzDecoder::new(buffer);
                let deserializer = JsonDeserializer::from_reader(decompressor);
                let iterator = deserializer.into_iter::<JsonValue>();
                for item in iterator {
                    let item = item?;
                    let id = item.get("id").unwrap().as_str().unwrap().to_string();
                    spider.resource_by_id(resource).insert(id, item);
                }
                info!(
                    "Loaded {} {}.",
                    spider.resource_by_id(resource).len(),
                    resource.id
                );
            }
            Ok(())
        };

        if let Err(error) = load() {
            info!("Error: {:?}", error);
        }

        spider
    }

    fn save(&mut self, resource: &Resource) -> Result<(), BoxErr> {
        info!(
            "Saving {} {}...",
            self.resource_by_id(resource).len(),
            resource.id
        );
        {
            let mut file = NamedTempFile::new_in("data")?;
            {
                let buffer = BufWriter::new(&mut file);
                let mut compressor = GzEncoder::new(buffer, flate2::Compression::best());
                for data in self.resource_by_id(resource).values() {
                    serde_json::to_writer(&mut compressor, &data)?;
                    compressor.write(b"\n")?;
                }
                compressor.finish()?;
            }
            file.persist(format!("data/api/{}.jsonl.gz", resource.id))?;
        }
        info!("Saved.");

        Ok(())
    }

    pub fn run(&mut self) -> Result<(), BoxErr> {
        let mut headers = reqwest::header::HeaderMap::new();

        let user_agent = format!(
            "{}/{}",
            option_env!("CARGO_PKG_NAME").unwrap_or("unknown"),
            option_env!("CARGO_PKG_VERSION").unwrap_or("unknown")
        );

        debug!("user agent: {}", user_agent);

        headers.insert(
            reqwest::header::USER_AGENT,
            reqwest::header::HeaderValue::from_str(&user_agent)?,
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()?;

        for resource in RESOURCES.iter() {
            // the logic:
            // try to grab from offset of len
            // if you see any duplicates, that means you're missing some at
            // the beginning, so you need to switch back into that mode.
            // if you don't see any duplicates, keep going forward until
            // you get a non-full page, indicating that you're at the end.
            // you can't save while you're filling from the beginning,
            // because if that's interrupted you could create gaps.
            //
            // Hmm, actually, I guess you can find gaps, eh?
            // If your end count is wrong but there are no new items at the
            // beginning, you can do a binary search to find the
            // place that missing records throw off your indices.
            //
            // deletions still mess this up, though. you'd need to be able
            // to identify them to have a fullly robust solution.

            for from_start in vec![true, false] {
                let mut previous = self.resource_by_id(resource).len();
                for i in 0..=std::usize::MAX {
                    let resource_by_id = self.resource_by_id(resource);
                    let len = resource_by_id.len();

                    let offset = if from_start { i * 200 } else { len };

                    let what = if from_start { "new" } else { "old" };
                    info!(
                        "We have {} {}, looking for more {} {}...",
                        len, resource.id, what, resource.id
                    );

                    let url = format!("https://www.speedrun.com/api/v1/{}?direction=desc&max=200&orderby={}&embed={}&offset={}", resource.id, resource. order, resource.embed, offset);

                    let response: JsonValue;
                    loop {
                        match client.get(&url).send() {
                            Ok(mut ok) => {
                                response = ok.json().unwrap();
                                break
                            }
                            Err(error) => {
                                error!("{:?}", error);
                                std::thread::sleep(std::time::Duration::from_secs(32));
                                continue
                            }
                        }
                    }

                    let response = response.as_object().unwrap();
                    let items = response["data"].as_array().unwrap();

                    for item in items.iter().cloned() {
                        let id = item.get("id").unwrap().as_str().unwrap().to_string();
                        self.resource_by_id(resource).insert(id, item);
                    }

                    let more = self.resource_by_id(resource).len() - previous;
                    info!("Got {} more {}.", more, resource.id);

                    if from_start {
                        if self.resource_by_id(resource).len() == previous {
                            // no new items at beginning of list
                            break
                        }
                    } else {
                        if items.len() < 200 {
                            // end of entire run list
                            break
                        }

                        // save progress
                        if i % 256 == 0 {
                            self.save(resource)?;
                        }
                    };

                    previous = self.resource_by_id(resource).len();

                    std::thread::sleep(std::time::Duration::from_secs(4));
                }
            }

            self.save(resource)?;
        }

        std::process::exit(0)
    }
}

pub fn main() -> Result<(), BoxErr> {
    env_logger::try_init_from_env(
        env_logger::Env::new()
            .default_filter_or(format!("reqwest=debug,{}=trace", module_path!())),
    )?;

    Spider::load_or_create().run()
}

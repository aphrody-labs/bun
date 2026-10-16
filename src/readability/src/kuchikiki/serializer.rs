// Derived from brave/kuchikiki 0.8.9-speedreader (MIT, see LICENSE-kuchikiki).
// Absorbed into Bun: selector support removed, html5ever 0.40.

use html5ever::serialize::TraversalScope::*;
use html5ever::serialize::{serialize, Serialize, SerializeOpts, Serializer, TraversalScope};
use html5ever::QualName;
use std::fmt;
use std::io;
use std::io::Write;

use crate::kuchikiki::tree::{NodeData, NodeRef};

impl Serialize for NodeRef {
    fn serialize<S: Serializer>(
        &self,
        serializer: &mut S,
        traversal_scope: TraversalScope,
    ) -> io::Result<()> {
        match (traversal_scope, self.data()) {
            (ref scope, NodeData::Element(element)) => {
                if *scope == IncludeNode {
                    let attrs = element.attributes.borrow();

                    // Unfortunately we need to allocate something to hold these &'a QualName
                    let attrs = attrs
                        .map
                        .iter()
                        .map(|(name, attr)| {
                            (
                                QualName::new(
                                    attr.prefix.clone(),
                                    name.ns.clone(),
                                    name.local.clone(),
                                ),
                                &attr.value,
                            )
                        })
                        .collect::<Vec<_>>();

                    serializer.start_elem(
                        element.name.clone(),
                        attrs.iter().map(|&(ref name, value)| (name, &**value)),
                    )?
                }

                for child in self.children() {
                    Serialize::serialize(&child, serializer, IncludeNode)?
                }

                if *scope == IncludeNode {
                    serializer.end_elem(element.name.clone())?
                }
                Ok(())
            }

            (_, &NodeData::DocumentFragment) | (_, &NodeData::Document(_)) => {
                for child in self.children() {
                    Serialize::serialize(&child, serializer, IncludeNode)?
                }
                Ok(())
            }

            (ChildrenOnly(_), _) => Ok(()),

            (IncludeNode, NodeData::Doctype(doctype)) => serializer.write_doctype(&doctype.name),
            (IncludeNode, NodeData::Text(text)) => serializer.write_text(&text.borrow()),
            (IncludeNode, NodeData::Comment(text)) => serializer.write_comment(&text.borrow()),
            (IncludeNode, NodeData::ProcessingInstruction(contents)) => {
                let contents = contents.borrow();
                serializer.write_processing_instruction(&contents.0, &contents.1)
            }
        }
    }
}

impl fmt::Display for NodeRef {
    #[inline]
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        // Call the html serializer for the node (sub)tree.
        let mut bytes = Vec::new();
        self.serialize(&mut bytes).or(Err(fmt::Error))?;
        let html = String::from_utf8(bytes).or(Err(fmt::Error))?;
        f.write_str(&html)
    }
}

impl NodeRef {
    /// Serialize this node and its descendants in HTML syntax to the given stream.
    #[inline]
    pub fn serialize<W: Write>(&self, writer: &mut W) -> io::Result<()> {
        serialize(
            writer,
            self,
            SerializeOpts {
                traversal_scope: IncludeNode,
                ..Default::default()
            },
        )
    }

    /// Serialize only the children of this node (inner HTML).
    pub fn inner_html(&self) -> String {
        let mut bytes = Vec::new();
        let _ = serialize(
            &mut bytes,
            self,
            SerializeOpts {
                traversal_scope: ChildrenOnly(None),
                ..Default::default()
            },
        );
        String::from_utf8(bytes).unwrap_or_default()
    }
}

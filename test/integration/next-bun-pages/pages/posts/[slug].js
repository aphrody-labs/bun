export async function getStaticPaths() {
  return { paths: [{ params: { slug: "first" } }, { params: { slug: "second" } }], fallback: false };
}

export async function getStaticProps({ params }) {
  return { props: { slug: params.slug } };
}

export default function Post({ slug }) {
  return <article id="post">post: {slug}</article>;
}

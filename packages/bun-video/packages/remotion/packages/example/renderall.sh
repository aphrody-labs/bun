compositions=($(bunx remotion compositions src/index.ts -q))


for composition in "${compositions[@]}"
do
  echo $composition
  bunx remotion render src/index.ts $composition $composition.mp4
done

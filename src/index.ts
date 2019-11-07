import axios from 'axios';
import * as fs from 'fs';
import { fit, kernel } from 'sharp';
import { promisify } from 'util';
import { AsyncIterable } from 'ix';
import * as md5 from 'md5';
import { dirname } from 'path';
import * as sharp from 'sharp';

const mkdir = promisify(fs.mkdir);
const exists = fs.existsSync;

const maxImages = 10;
const resizeFit = fit.cover;
const resizeType = kernel.nearest;
const outPath = `${__dirname}/../out`;
type OriginalResolution = 'original';
const OriginalResolution = 'original';
type Resolution = string | OriginalResolution;

const resolutions: Resolution[] = [
  OriginalResolution,
  '750x750', '450x450', '350x350',
  '268x268', '218x218', '182x182',
  '50x50'
];
const [, , ...remoteUrls] = process.argv;
const urls = remoteUrls.slice(0, maxImages);

const wrapAsObject = url => ({ url });

const withDownload = async ({ url, ...others }) => ({
  ...others,
  url,
  data: await axios.get<Buffer>(url, { responseType: 'arraybuffer' }).then(r => r.data)
});

const withHash = ({ data, ...others }) => ({ ...others, data, hash: md5(data) });

const withResolutions = obj => ({ ...obj, resolutions });

const withPaths = ({ hash, resolutions, ...others }) => ({
  ...others,
  hash,
  resolutions,
  paths: resolutions.map(r => ({ resolution: r, path: `${outPath}/${hash}/${r}.jpg` }))
});

const withOutExistingPaths = ({ paths, ...others }) => ({
  ...others,
  paths: paths.filter(({ path }) => !exists(path))
});

const filterFilledPaths = ({ paths }) => paths.length > 0;

const createDir = ({ paths }) => mkdir(dirname(paths[0].path), { recursive: true });

const scaleImage = ({ data, paths, ...others }) => {
  const transform = others => ({ ...others, transform: sharp(data) });
  const resize = ({ resolution, transform, ...others }) => {
    const [width, height] = resolution.split('x').map(x => Number(x));

    return {
      ...others, resolution,
      transform: transform.resize(width, height, { fit: resizeFit, kernel: resizeType })
    };
  };
  const toJpeg = ({ transform, ...others }) => ({ ...others, transform: transform.jpeg() });

  return {
    ...others,
    paths: paths
      .map(transform)
      .map(p => p.resolution === OriginalResolution ? p : resize(p))
      .map(toJpeg)
  };
};

const writeImage = ({ paths }) => Promise.all(paths.map(({ path, transform }) => transform.toFile(path)));

(async () => {
  AsyncIterable.from(urls)
    .map(wrapAsObject)
    .map(withDownload)
    .map(withHash)
    .map(withResolutions)
    .map(withPaths)
    .map(withOutExistingPaths)
    .filter(filterFilledPaths)
    .tap(createDir)
    .map(scaleImage)
    .tap(writeImage)
    .forEach(({ url, paths }: any) => console.log(`Written ${url} ${paths.length} times`));
})();

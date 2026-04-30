import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: {
    file: 'com.hogehoge.ats-mini.sdPlugin/bin/index.js',
    format: 'cjs',
    sourcemap: true,
    exports: 'auto'
  },
  plugins: [
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json' })
  ],
  external: ['serialport']
};

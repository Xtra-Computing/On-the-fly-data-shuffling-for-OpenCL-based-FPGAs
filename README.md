# On-the-fly-data-shuffling-for-OpenCL-based-FPGAs

## Prerequisites
* gcc4.8 or above
* The OpenCL SDK 16.0.2 for FPGA from Intel
* The De5net board 

## Run the code

Do not forget to set the PATH of the dataset. 

```sh
$ cd ./src
$ make  # make the host execution program
$ aoc ./src/graph_fpga.cl -o ./bin/graph_fpga.aocx  # make the FPGA execution program. It takes around a few hours.
$ cd ./bin
$ ./host
```

## Cite this work
```
@inproceedings{chen2019fly,
  title={On-The-Fly Parallel Data Shuffling for Graph Processing on OpenCL-based FPGAs},
  author={Chen, Xinyu and Bajaj, Ronak and Chen, Yao and He, Jiong and He, Bingsheng and Wong, Weng-Fai and Chen, Deming},
  booktitle={2019 29th International Conference on Field Programmable Logic and Applications (FPL)},
  pages={67--73},
  year={2019},
  organization={IEEE}
}
```

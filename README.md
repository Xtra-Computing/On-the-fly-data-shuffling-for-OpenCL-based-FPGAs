# ThunderGP: Efficient Graph Processing on OpenCL-based FPGAs

## Prerequisites
* The gcc-4.8 or above
* The Altera OpenCL SDK 16.0.2 for FPGA 
* The De5net board 

## Run the code

Do not forget to set the PATH of the dataset. 

```sh
$ cd ./
$ make  # make the host execution program
$ aoc ./src/graph_fpga.cl -o ./bin/graph_fpga.aocx  # make the FPGA execution program. It takes time.
$ cd ./bin
$ ./host
```

## Cite this work
If you use ThunderGP  in your paper, please cite our work ([full version](https://www.comp.nus.edu.sg/~hebs/pub/fpl19-graph.pdf)).
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
### Related publications
* Xinyu Chen*, Ronak Bajaj^, Yao Chen, Jiong He, Bingsheng He, Weng-Fai Wong and Deming Chen. [Is FPGA useful for hash joins](https://www.comp.nus.edu.sg/~hebs/pub/cidr20-join.pdf). CIDR 2020: Conference on Innovative Data Systems Research


## Related systems

* Graph systems on GPU: [G3](https://github.com/Xtra-Computing/G3) | [Medusa](https://github.com/Xtra-Computing/Medusa)
* Other Thunder-series systems in Xtra NUS: [ThunderGBM](https://github.com/Xtra-Computing/thundergbm) | [ThunderSVM](https://github.com/Xtra-Computing/thundersvm)

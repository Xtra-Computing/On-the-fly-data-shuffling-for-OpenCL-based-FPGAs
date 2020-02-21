#include <stdlib.h>
#include <malloc.h>
#include <iostream>
#include <fstream>
#include <unordered_map>
#include <chrono>
#include <algorithm>
#include <iostream>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <vector>
#include <cstdio>
#include <math.h>
#include <ctime>
#include "config.h"
#include "graph.h"
#include "safequeue.h"
#include "CL/opencl.h"
#include "AOCLUtils/aocl_utils.h"
#include <tr1/unordered_map>
#include <cmath>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <pthread.h>
#include<float.h>
#include <sys/time.h>

using namespace std::tr1;
using namespace aocl_utils;
using namespace std;

cl_mem edgesTuples_device;
cl_mem read_info_device;
cl_mem tmpVertexProp_device;
cl_mem sinkRange_device;
cl_mem vertexScore_device;
cl_mem edgeScoreMap_device;
cl_mem vertexProp_device;
cl_mem error_device;
cl_mem outDeg_device;
//cl_mem read_info;

static cl_command_queue queue_readEdges;
static cl_command_queue queue_processEdges;
static cl_command_queue queue_gather;
static cl_command_queue queue_filter[16];
static cl_command_queue queue_vertexApply;

static cl_kernel kernel_readEdges;
static cl_kernel kernel_gather;
static cl_kernel kernel_processEdges;
static cl_kernel kernel_filter[16]; 
static cl_kernel kernel_vertexApply;

static cl_program program;

static cl_int status;
static PROP_TYPE* vertexProp;
static PROP_TYPE* tmpVertexProp;
static int* rpa;
static int* blkRpa;
static int* blkRpaNum;
static int* outDeg;
static int* blkRpaLast;
static int* cia;
static int* cia_padding;
static int* edgeScoreMap;
static int* vertexScore; // global - like outDeg
static PROP_TYPE* edgeProp;
static PROP_TYPE* edgesTuples;
static int* blkCia;
static PROP_TYPE* blkEdgeProp;
static int* activeVertices;
static int* activeVertexNum;
static int* blkActiveVertices;
static int* blkActiveVertexNum;
static int* itNum;
static int* read_info;
static int* edge_tuple_range;
static int* fpgaIterNum;
static int* blkEdgeNum;
static int* blkVertexNum;
static int* eop; // end of processing
static int* srcRange;
static int* sinkRange;
static int* error;
int vertexNum;
int edgeNum; 
int blkNum;
int base_score;
CSR* csr;
std::vector<CSR_BLOCK*> blkVec;
int processing_edges = 0;
int edge_replication_factor = 2;
//Notify the FPGA thread
static cl_platform_id platform;
static cl_device_id device;
static cl_context context;

static int fpga_partition_x = 0;
static int fpga_partition_y = 0;
static int max_partition_degree = 0; 
typedef int ScoreT;
double fpga_runtime =0;
#define AOCL_ALIGNMENT 64
#define THREAD_NUM 1
#define MAX_ITER 1
#define PR
#ifdef PR 
#define PROP_TYPE int
#define kDamp 0.85f
#define epsilon  0.001f
#endif
#define VERTEX_MAX 512*1024
#define ENDFLAG 0xffffffff



#define INT2FLOAT (pow(2,23))
int float2int(float a){
	return (int)(a * INT2FLOAT);
}

float int2float(int a){
	return ((float)a / INT2FLOAT);
}

#define RAND_RANGE(N) ((float)rand() / ((float)RAND_MAX + 1) * (N))

static void freeResources(){
	// We set all the objects to be shared by CPU and FPGA, though
	// some of them are only used by CPU process.
	if(vertexProp)         clSVMFreeAltera(context, vertexProp);
	if(tmpVertexProp)      clSVMFreeAltera(context, tmpVertexProp);
	if(rpa)                clSVMFreeAltera(context, rpa);
	if(blkRpa)             clSVMFreeAltera(context, blkRpa);
	if(outDeg)             clSVMFreeAltera(context, outDeg);
	if(cia)                clSVMFreeAltera(context, cia);
	if(edgeProp)           clSVMFreeAltera(context, edgeProp);
	if(blkCia)             clSVMFreeAltera(context, blkCia);
	if(blkEdgeProp)        clSVMFreeAltera(context, blkEdgeProp);
	if(activeVertices)     clSVMFreeAltera(context, activeVertices);
	if(blkActiveVertices)  clSVMFreeAltera(context, blkActiveVertices);
	if(activeVertexNum)    clSVMFreeAltera(context, activeVertexNum);
	if(blkActiveVertexNum) clSVMFreeAltera(context, blkActiveVertexNum);
	if(itNum)              clSVMFreeAltera(context, itNum);
	if(blkVertexNum)       clSVMFreeAltera(context, blkVertexNum);
	if(blkEdgeNum)         clSVMFreeAltera(context, blkEdgeNum);
	if(eop)                clSVMFreeAltera(context, eop);
	if(context)            clReleaseContext(context);
}

void cleanup(){}

void dumpError(const char *str) {
	printf("Error: %s\n", str);
	freeResources();
}

void checkStatus(const char *str) {
	if(status != 0 || status != CL_SUCCESS){
		dumpError(str);
		printf("Error code: %d\n", status);
	}
}


void setKernelEnv(){
	queue_readEdges = clCreateCommandQueue(context, device, CL_QUEUE_PROFILING_ENABLE, &status);
	checkStatus("Failed clCreateCommandQueue of queue_readEdges.");
	queue_gather = clCreateCommandQueue(context, device, CL_QUEUE_PROFILING_ENABLE, &status);
	checkStatus("Failed clCreateCommandQueue of queue_gather.");
	queue_processEdges = clCreateCommandQueue(context, device, CL_QUEUE_PROFILING_ENABLE, &status);
	checkStatus("Failed clCreateCommandQueue of queue_processEdges.");
	for(int i = 0; i < 16; i ++){
		queue_filter[i] = clCreateCommandQueue(context, device, CL_QUEUE_PROFILING_ENABLE, &status);
	}
	checkStatus("Failed clCreateCommandQueue of queue_filter.");
	queue_vertexApply = clCreateCommandQueue(context, device, CL_QUEUE_PROFILING_ENABLE, &status);
	checkStatus("Failed clCreateCommandQueue of queue_gather.");

	size_t binSize = 0;
	unsigned char* binaryFile = loadBinaryFile("./graph_fpga.aocx", &binSize);
	if(!binaryFile) dumpError("Failed loadBinaryFile.");

	program = clCreateProgramWithBinary(
		context, 1, &device, &binSize, (const unsigned char**)&binaryFile, 
		&status, &status);
	if(status != CL_SUCCESS) delete [] binaryFile;
	checkStatus("Failed clCreateProgramWithBinary of program.");

	status = clBuildProgram(program, 0, NULL, "", NULL, NULL);
	checkStatus("Failed clBuildProgram.");

	std::cout << "set kernel env." << std::endl;
}
// access FPGA using the main thread 
void setHardwareEnv(){
	cl_uint numPlatforms;
	cl_uint numDevices;
	status = clGetPlatformIDs(1, &platform, &numPlatforms);
	checkStatus("Failed clGetPlatformIDs.");
	printf("Found %d platforms!\n", numPlatforms);

	status = clGetDeviceIDs(platform, CL_DEVICE_TYPE_ALL, 1, &device, &numDevices);
	checkStatus("Failed clGetDeviceIDs.");
	printf("Found %d devices!\n", numDevices);

	context = clCreateContext(0, 1, &device, NULL, NULL, &status);
	checkStatus("Failed clCreateContext.");
}

Graph* createGraph(const std::string &gName, const std::string &mode){
	Graph* gptr;
	std::string dir;
	if(mode == "harp") dir = "/upb/departments/pc2/groups/harp2/x/xchen/bdw_fpga_design/bin/";
	else if(mode == "sim") dir = "/home/xinyuc/Dataset/graphs/";
	else if(mode == "rmat") dir = "/home/xinyuc/Dataset/krongen/";
	else if(mode == "de5_rmat") dir = "/home/xinyu/Dataset/krongen/";
	else if(mode == "de5_run") dir = "/home/xinyu/Dataset/graphs/";
	//else if(mode == "de5_run") dir = "/home/xinyu/Dataset/power-law/";

	else {
		std::cout << "unknown execution environment." << std::endl;
		exit(0);
	}


	if(gName == "dblp"){
		gptr = new Graph(dir + "dblp.ungraph.txt");
	}
  else if(gName == "0"){
      gptr = new Graph(dir + "alpha_3.txt");
  }

	else if(gName == "youtube"){
		gptr = new Graph(dir + "youtube.ungraph.txt");
	}
	else if(gName == "lj"){
		gptr = new Graph(dir + "lj.ungraph.txt");
	}
	else if(gName == "pokec"){
		gptr = new Graph(dir + "pokec-relationships.txt");
	}
	else if(gName == "wiki-talk"){
		gptr = new Graph(dir + "wiki-Talk.txt");
	}
	else if(gName == "lj1"){
		gptr = new Graph(dir + "LiveJournal1.txt");
	}
	else if(gName == "rmat-21-32"){
		gptr = new Graph(dir + "rmat-21-32.txt");
	}
	else if(gName == "rmat-19-32"){
		gptr = new Graph(dir + "rmat-19-32.txt");
	}
	else if(gName == "rmat-21-128"){
		gptr = new Graph(dir + "rmat-21-128.txt");
	}
	else if(gName == "twitter"){
		gptr = new Graph(dir + "twitter_rv.txt");
	}
	else if(gName == "friendster"){
		gptr = new Graph(dir + "friendster.ungraph.txt");
	}
	else if(gName == "example"){
		gptr = new Graph(dir + "rmat-1k-10k.txt");
	}
	else if(gName == "rmat-12-4"){
		gptr = new Graph(dir + "rmat-12-4.txt");
	}
	else if(gName == "rmat-23-4"){
		gptr = new Graph(dir + "rmat-23-4.txt");
	}
	else if(gName == "rmat-23-16"){
		gptr = new Graph(dir + "rmat-23-16.txt");
	}
	else if(gName == "wiki-Talk"){
		gptr = new Graph(dir + "soc-wiki-Talk-dir.mtx");
	}
	else if(gName == "orkut"){
		gptr = new Graph(dir + "soc-orkut-dir.edges");
	}
	else if(gName == "twitter-higgs"){
		gptr = new Graph(dir + "soc-twitter-higgs.edges");
	}
	else if(gName == "twitter-2010"){
		gptr = new Graph(dir + "soc-twitter-2010.mtx");
	}
	else if(gName == "google"){
		gptr = new Graph(dir + "web-Google.mtx");
	}
	else if(gName == "mouse-gene"){
		gptr = new Graph(dir + "bio-mouse-gene.edges");
	}
	else if(gName == "flixster"){
		gptr = new Graph(dir + "soc-flixster.mtx");
	}
	else{
		std::cout << "Unknown graph name." << std::endl;
		exit(EXIT_FAILURE);
	}

	return gptr;
}
int edge_factor = 2;
void globalVarInit(
	CSR* csr, 
	const int &vertexNum, 
	const int &edgeNum
	)
{
	printf("blkNum %d \n", blkNum);
	edgesTuples        = (PROP_TYPE*) clSVMAllocAltera(context, 0, sizeof(PROP_TYPE) * (edgeNum+ 8 * blkNum) * edge_factor, 1024);
	edgeScoreMap	   = (int*) clSVMAllocAltera(context, 0, sizeof(int) * (edgeNum + 8 * blkNum) * edge_factor, 1024);
	vertexScore        = (int*) clSVMAllocAltera(context, 0, sizeof(int) * vertexNum, 1024);

	vertexProp         = (PROP_TYPE*) clSVMAllocAltera(context, 0, sizeof(PROP_TYPE) * vertexNum, 1024); 
	tmpVertexProp      = (PROP_TYPE*) clSVMAllocAltera(context, 0, sizeof(PROP_TYPE) * vertexNum, 1024);
	outDeg             = (int*) clSVMAllocAltera(context, 0, sizeof(int) * vertexNum, 1024);
	edge_tuple_range   = (int*) clSVMAllocAltera(context, 0, sizeof(int) * blkNum, 1024);

	//outdeg_padding     = (int*) clSVMAllocAltera(context, 0, sizeof(int) * (ceil(vertexNum / BLK_SIZE) * BLK_SIZE * blkNum), 1024);
	//blkRpaNum          = (int*) clSVMAllocAltera(context, 0, sizeof(int) * (vertexNum), 1024);
	blkRpaLast    	   = (int*) clSVMAllocAltera(context, 0, sizeof(int) * blkNum * blkNum, 1024);
	read_info 		   = (int*) clSVMAllocAltera(context, 0, sizeof(int) * 2, 1024); 
	blkEdgeProp        = (PROP_TYPE*) clSVMAllocAltera(context, 0, sizeof(PROP_TYPE) * 1, 1024); ///////////////////////////////// problem here
	blkActiveVertexNum = (int*) clSVMAllocAltera(context, 0, sizeof(int) * blkNum * blkNum, 1024); // The MAX partitions FPGA need to process
	blkEdgeNum     	   = (int*) clSVMAllocAltera(context, 0, sizeof(int) * blkNum * blkNum, 1024); 
	blkVertexNum 	   = (int*) clSVMAllocAltera(context, 0, sizeof(int) * blkNum * blkNum, 1024); 
	srcRange 	   	   = (int*) clSVMAllocAltera(context, 0, sizeof(int) * blkNum * blkNum * 2, 1024);  
	sinkRange 	   	   = (int*) clSVMAllocAltera(context, 0, sizeof(int) * blkNum * blkNum * 2, 1024);  
	itNum     		   = (int*) clSVMAllocAltera(context, 0, sizeof(int), 1024);
	fpgaIterNum        = (int*) clSVMAllocAltera(context, 0, sizeof(int), 1024);  
	eop  		       = (int*) clSVMAllocAltera(context, 0, sizeof(int), 1024); 
	error 	       	   = (int*) clSVMAllocAltera(context, 0, sizeof(int), 1024); 

	
	rpa                = (int*) malloc(sizeof(int) * (vertexNum + 1)); //= (int*) clSVMAllocAltera(context, 0, sizeof(int) * (vertexNum + 1), 1024);
	cia           	   = (int*) malloc(sizeof(int) * edgeNum * 2); //= (int*) clSVMAllocAltera(context, 0, sizeof(int) * edgeNum * 2, 1024); // undirection graph
	edgeProp           = (int*) malloc(sizeof(int) * edgeNum );//= (PROP_TYPE*) clSVMAllocAltera(context, 0, sizeof(PROP_TYPE) * edgeNum, 1024);
	activeVertices     = (int*) malloc(sizeof(int) * vertexNum );//= (int*) clSVMAllocAltera(context, 0, sizeof(int) * vertexNum, 1024);
	activeVertexNum    = (int*) malloc(sizeof(int) * 1); //= (int*) clSVMAllocAltera(context, 0, sizeof(int), 1024);
	blkActiveVertices  = (int*) malloc(sizeof(int) * (blkNum * BLK_SIZE * blkNum));
	cia_padding        = (int*) malloc(sizeof(int) * edgeNum * edge_replication_factor * 2);	
	blkRpa             = (int*) malloc(sizeof(int) * (blkNum * BLK_SIZE * blkNum)); // because it is from 2 dimension to 1 dimension, so * 2

// allocate the device memory 


	vertexScore_device = clCreateBuffer(context,CL_MEM_READ_WRITE,sizeof(PROP_TYPE) * vertexNum, 0,&status);
	if (status != CL_SUCCESS){
		cout << "Create rTableOnDevice failed" << endl;
		exit(1);
	}
	
	edgeScoreMap_device = clCreateBuffer(context,CL_MEM_READ_WRITE,sizeof(PROP_TYPE) * (edgeNum+8 * blkNum) * edge_factor  ,0,&status);
	if (status != CL_SUCCESS){
		cout << "Create rTableOnDevice failed" << endl;
		exit(1);
	}
	
	edgesTuples_device = clCreateBuffer(context,CL_MEM_READ_WRITE,sizeof(PROP_TYPE) * (edgeNum+8 * blkNum) * edge_factor ,0,&status);
	if (status != CL_SUCCESS){
		cout << "Create rTableOnDevice failed" << endl;
		exit(1);
	}
	read_info_device = clCreateBuffer(context,CL_MEM_READ_WRITE,sizeof(int) * 2,0,&status);
	if (status != CL_SUCCESS){
		cout << "Create sTableOnDevice failed" << endl;
		exit(1);
	}
	tmpVertexProp_device = clCreateBuffer(context,CL_MEM_READ_WRITE,sizeof(PROP_TYPE) * vertexNum,0,&status);
	if (status != CL_SUCCESS){
		cout << "Create matchedTableOnDevice failed" << endl;
		exit(1);
	}
	sinkRange_device = clCreateBuffer(context,CL_MEM_READ_WRITE,sizeof(int) * 2,0,&status);
	if (status != CL_SUCCESS){
		cout << "Create matchedTableOnDevice failed" << endl;
		exit(1);
	}


	vertexProp_device = clCreateBuffer(context,CL_MEM_READ_WRITE,sizeof(PROP_TYPE) * vertexNum,0,&status);
	if (status != CL_SUCCESS){
		cout << "Create matchedTableOnDevice failed" << endl;
		exit(1);
	}
	error_device = clCreateBuffer(context,CL_MEM_READ_WRITE,sizeof(PROP_TYPE) * 16,0,&status);
	if (status != CL_SUCCESS){
		cout << "Create matchedTableOnDevice failed" << endl;
		exit(1);
	}
	outDeg_device = clCreateBuffer(context,CL_MEM_READ_WRITE,sizeof(PROP_TYPE) * vertexNum,0,&status);
	if (status != CL_SUCCESS){
		cout << "Create matchedTableOnDevice failed" << endl;
		exit(1);
	}

	if(!vertexProp || !tmpVertexProp || !rpa || !blkRpa 
		|| !outDeg || !cia || !edgeProp 
		|| !activeVertices|| !activeVertexNum 
		|| !blkActiveVertices || !blkActiveVertexNum 
		|| !itNum || !blkEdgeNum || !blkVertexNum || !eop 
		|| !srcRange || !sinkRange
		){
		dumpError("Failed to allocate buffers.");
	}
	else{
		printf("SVMAllocAltera Done! \n");
	}

	for(int i = 0; i < vertexNum; i++){
		if(i < csr->vertexNum){ // 'vertexNum' may be aligned.	
			rpa[i] = csr->rpao[i];
			outDeg[i] = csr->rpao[i + 1] - csr->rpao[i];
	}
	else{
		rpa[i] = 0;
		outDeg[i] = 0;
		}
	}
	rpa[vertexNum] = csr->rpao[vertexNum]; 
	for(int i = 0; i < edgeNum; i++){
		cia[i] = csr->ciao[i];
		edgeProp[i] = rand()%100;
	}


}
void write_device_DDR()
{
	status = clEnqueueWriteBuffer(queue_readEdges,vertexScore_device, CL_TRUE,0,sizeof(PROP_TYPE) * vertexNum , vertexScore,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing  1 table into buffer failed" << endl;
		exit(1);
	}
	status = clEnqueueWriteBuffer(queue_readEdges,edgeScoreMap_device, CL_TRUE,0,sizeof(PROP_TYPE) * (edgeNum+8 * blkNum) * edge_factor , edgeScoreMap,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing  2 table into buffer failed" << endl;
		exit(1);
	}
	//write data on host into device DDR
	status = clEnqueueWriteBuffer(queue_readEdges,edgesTuples_device, CL_TRUE,0,sizeof(PROP_TYPE) * (edgeNum+8 * blkNum) * edge_factor, edgesTuples,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing  3 table into buffer failed" << endl;
		exit(1);
	}
	status = clEnqueueWriteBuffer(queue_readEdges,read_info_device,CL_TRUE,0,sizeof(int) * 2, read_info,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing  S table into buffer failed" << endl;
		exit(1);
	}
	status = clEnqueueWriteBuffer(queue_processEdges,tmpVertexProp_device,CL_TRUE,0,sizeof(PROP_TYPE) * vertexNum, tmpVertexProp,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing matchedTable table into buffer failed" << endl;
		exit(1);
	}
	status = clEnqueueWriteBuffer(queue_processEdges,sinkRange_device,CL_TRUE,0,sizeof(int) * 2,sinkRange,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing matchedTable table into buffer failed" << endl;
		exit(1);
	}

}
void write_device_DDR_vertex_apply()
{

	status = clEnqueueWriteBuffer(queue_vertexApply,vertexProp_device,CL_TRUE,0,sizeof(PROP_TYPE) * vertexNum, vertexProp,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing matchedTable table into buffer failed" << endl;
		exit(1);
	}
	status = clEnqueueWriteBuffer(queue_vertexApply,outDeg_device,CL_TRUE,0,sizeof(int) * vertexNum, outDeg,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing matchedTable table into buffer failed" << endl;
		exit(1);
	}
	status = clEnqueueWriteBuffer(queue_vertexApply,error_device,CL_TRUE,0,sizeof(int), error,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing matchedTable table into buffer failed" << endl;
		exit(1);
	}
}
void createKernels(
	const int &vertexNum, 
	const int &edgeNum
	)
{
	std::cout << "Creating graph processing kernels." << std::endl;
	kernel_readEdges = clCreateKernel(program, "readEdges", &status);
	checkStatus("Failed clCreateKernel readEdges vertices.");
	kernel_gather = clCreateKernel(program, "gather", &status);
	checkStatus("Failed clCreateKernel status gather.");
	kernel_processEdges = clCreateKernel(program, "processEdges", &status);
	checkStatus("Failed clCreateKernel processEdge.");

	kernel_filter[0] =  clCreateKernel(program, "filter", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[1] =  clCreateKernel(program, "filter1", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[2] =  clCreateKernel(program, "filter2", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[3] =  clCreateKernel(program, "filter3", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[4] =  clCreateKernel(program, "filter4", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[5] =  clCreateKernel(program, "filter5", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[6] =  clCreateKernel(program, "filter6", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[7] =  clCreateKernel(program, "filter7", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[8] =  clCreateKernel(program, "filter8", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[9] =  clCreateKernel(program, "filter9", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[10]=  clCreateKernel(program, "filter10", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[11]=  clCreateKernel(program, "filter11", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[12]=  clCreateKernel(program, "filter12", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[13]=  clCreateKernel(program, "filter13", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[14]=  clCreateKernel(program, "filter14", &status);
	checkStatus("Failed clCreateKernel filter.");
	kernel_filter[15]=  clCreateKernel(program, "filter15", &status);
	checkStatus("Failed clCreateKernel filter.");

	kernel_vertexApply = clCreateKernel(program, "vertexApply", &status);
	checkStatus("Failed clCreateKernel processEdge.");
}



void singleThreadSWProcessing(
	CSR* csr,
	std::vector<CSR_BLOCK*> &blkVec, 
	PROP_TYPE* ptProp, 
	const int &blkNum,
	const int &vertexNum,
	const int &source
	)
{	
	base_score = float2int((1.0f - kDamp) /vertexNum);
	printf("base_score original %.*f \n", 10,(1.0f- kDamp) /vertexNum);
	printf("base_score int %d \n", base_score);
	printf("base_score after int %.*f\n", 10,int2float(base_score));
	itNum[0] = 0;
	while(itNum[0] < MAX_ITER){
		//std::cout << "Processing with partition, iteration: " << itNum[0] << std::endl;
		//#pragma omp parallel for
		for (int u=0; u < vertexNum; u++) {
			int start = rpa[u];
			int num = rpa[u+1] - rpa[u];
			for(int j = 0; j < num; j++){
					tmpVertexProp[cia[start + j]] += vertexProp[u] / (csr->rpao[u+1] - csr->rpao[u]);
			}	
		}
		int error = 0;
		//#pragma omp parallel for reduction(+:error)
		for(int i = 0; i < vertexNum; i++){
			PROP_TYPE tProp = tmpVertexProp[i];
			PROP_TYPE old_score = vertexProp[i];
			vertexProp[i] = base_score + kDamp * tProp;
			error += fabs(vertexProp[i] - old_score);
			tmpVertexProp[i] = 0;
			if(outDeg[i] > 0) vertexScore[i] = vertexProp[i]/outDeg[i];
		}
		printf(" %2d    %lf\n", itNum[0], int2float(error));
		activeVertexNum[0] = vertexNum;
		itNum[0]++;
	}
}
//firstly, we assume all the vertexes can be cached in BRAM
void col_partition(CSR* csr){
	
	//uint cur_edge_num = 0;
	#pragma omp parallel for
	for (int u=0; u < vertexNum; u++) {
		int start = rpa[u];
		int num = rpa[u+1] - rpa[u];
		for(int j = 0; j < num; j++){
			//tmpVertexProp[cia[start + j]] += vertexScore[u];//vertexProp[u] / (csr->rpao[u+1] - csr->rpao[u]);
			int cia_idx = start + j;
			edgesTuples[2*cia_idx] = cia[cia_idx];
			edgesTuples[2*cia_idx + 1] = vertexScore[u];
			//cur_edge_num ++;
		}	
	}
	uint cur_edge_num = edgeNum;
	//add a end dummy keys
	for(int i = 0; i < 8; i ++){
		edgesTuples[2*cur_edge_num] = i;
		edgesTuples[2*cur_edge_num + 1] = ENDFLAG;
		cur_edge_num ++;
	}
	read_info[0] = 0;
	read_info[1] = edgeNum + 8;
	sinkRange[0] = 0;
	sinkRange[1] = VERTEX_MAX;
	printf("cur_edge_num %d \n", cur_edge_num);
}


void col_partition_muli_partition(CSR* csr){

uint cur_edge_num = 0;
for(int i = 0; i < blkNum; i ++){
	for (int u=0; u < vertexNum; u++) {
		int start = rpa[u];
		int num = rpa[u+1] - rpa[u];
		for(int j = 0; j < num; j++){
			//tmpVertexProp[cia[start + j]] += vertexScore[u];//vertexProp[u] / (csr->rpao[u+1] - csr->rpao[u]);
			int cia_idx = start + j; //printf("cia_idx %d\n",cia_idx );
			if((cia[cia_idx] >= i * VERTEX_MAX) && (cia[cia_idx] < (i+1) * VERTEX_MAX)){
				edgesTuples[cur_edge_num] = cia[cia_idx];
				edgeScoreMap[cur_edge_num] = u;
				cur_edge_num ++;
			}
		}	
	}
	printf("unpad edge_tuple_range %d\n", cur_edge_num);
	printf("%d cur_edge_num % 8 \n", 8 - cur_edge_num % 8 );

	int unpad_edge_num = cur_edge_num;

	for(int k = 0; k < (8 - (unpad_edge_num % 8)); k ++){
		edgesTuples[cur_edge_num] = ENDFLAG;
		edgeScoreMap[cur_edge_num] = edgeScoreMap[cur_edge_num-1];
		cur_edge_num ++; printf("edge_tuple_range %d\n", cur_edge_num);
	}
	edge_tuple_range[i] = cur_edge_num;
	
}
}


void process_edges_cpu()
{	
	//#pragma omp parallel for
	printf("edge_tuple_range[blkNum - 1]  %d\n", edge_tuple_range[blkNum - 1]);
	for(int i = 0; i < edge_tuple_range[blkNum - 1]-8; i ++){
		uint dstIndx = edgesTuples[2*i];
		uint prop = edgesTuples[2*i + 1];
	    if(prop == ENDFLAG) 
	    	printf("current idx %d\n", dstIndx);
	    else
			tmpVertexProp[dstIndx] += prop;
	}
}

void edgeProcessingCPU(
	CSR* csr,
	std::vector<CSR_BLOCK*> &blkVec, 
	PROP_TYPE* ptProp, 
	const int &blkNum,
	const int &vertexNum,
	const int &source
	)
{	
	base_score = float2int((1.0f - kDamp) /vertexNum);
	printf("base_score original %.*f \n", 10,(1.0f- kDamp) /vertexNum);
	printf("base_score int %d \n", base_score);
	printf("base_score after int %.*f\n", 10,int2float(base_score));
	itNum[0] = 0;
	while(itNum[0] < MAX_ITER){
		//std::cout << "Processing with partition, iteration: " << itNum[0] << std::endl;
		//#pragma omp parallel for
		//col_partition(csr);
		col_partition_muli_partition(csr);
		double t1 = getCurrentTimestamp();
		//process_edges_cpu();
		double t2 = getCurrentTimestamp();
  		double elapsedTime = (t2 - t1) * 1000;
		std::cout << "[INFO] CPU edge processing  takes " << elapsedTime << " ms." << std::endl;

		int error = 0;
		//#pragma omp parallel for reduction(+:error)
		for(int i = 0; i < vertexNum; i++){
			PROP_TYPE tProp = tmpVertexProp[i];
			PROP_TYPE old_score = vertexProp[i];
			vertexProp[i] = base_score + kDamp * tProp;
			error += fabs(vertexProp[i] - old_score);
			tmpVertexProp[i] = 0;
			if(outDeg[i] > 0) vertexScore[i] = vertexProp[i]/outDeg[i];
		}
		printf(" %2d    %lf\n", itNum[0], int2float(error));
		activeVertexNum[0] = vertexNum;
		itNum[0]++;
	}
}



double launchFPGA()
{       

		cl_event event_readEdges;
		cl_event event_gather;
		cl_event event_filter[16];
		cl_event event_processEdges;
					
		double fpga_runtime_total = 0;
		// status = clEnqueueTask(queue_readEdges, kernel_readEdges, 0, NULL, &event_readEdges);
		// checkStatus("Failed to launch readEdges.");
		write_device_DDR();
		
		status = clEnqueueTask(queue_gather, kernel_gather, 0, NULL, &event_gather);
		checkStatus("Failed to launch readNgbInfo.");
		for(int i = 0; i < 16; i++){
		status = clEnqueueTask(queue_filter[i], kernel_filter[i], 0, NULL, &event_filter[i]);
		}
		// status = clEnqueueTask(queue_processEdges, kernel_processEdges, 0, NULL, &event_processEdges);
		// checkStatus("Failed to launch processEdge.");

		// clFinish(queue_readEdges);
		// clFinish(queue_processEdges);


		 for(int i = 0; i < blkNum; i ++){
		 	printf(" The %d iteration \n",i);
		 	if(i == 0)
		 		read_info[0]  = 0;
		 	else
		 		read_info[0] = edge_tuple_range[i-1];

		 	read_info[1] = edge_tuple_range[i];
		 	

		 	sinkRange[0] = VERTEX_MAX * i;

		 	if(VERTEX_MAX * (i+1) > vertexNum)
		 		sinkRange[1] = vertexNum;
		 	else
			sinkRange[1] = VERTEX_MAX * (i+1);


			status = clEnqueueWriteBuffer(queue_readEdges,read_info_device,CL_TRUE,0,sizeof(int) * 2, read_info,0,NULL,NULL);
			if (status != CL_SUCCESS){
				cout << "writing  S table into buffer failed" << endl;
				exit(1);
			}
			status = clEnqueueWriteBuffer(queue_processEdges,sinkRange_device,CL_TRUE,0,sizeof(int) * 2,sinkRange,0,NULL,NULL);
			if (status != CL_SUCCESS){
				cout << "writing matchedTable table into buffer failed" << endl;
				exit(1);
			}		 	
		    printf("fpga read_info %d, %d sinkRange %d, %d\n", read_info[0], read_info[1], sinkRange[0], sinkRange[1]);

			const double fpga_run_start = getCurrentTimestamp();
		 	
		 	status = clEnqueueTask(queue_readEdges, kernel_readEdges, 0, NULL, &event_readEdges);
		 	status = clEnqueueTask(queue_processEdges, kernel_processEdges, 0, NULL, &event_processEdges);

		 	clFinish(queue_readEdges);
		 	clFinish(queue_processEdges);

		 	const double fpga_run_end = getCurrentTimestamp();

		 	fpga_runtime_total += (fpga_run_end - fpga_run_start); 
			
		 }
			printf("[INFO] FPGA edge process runtime is %f ms \n", fpga_runtime_total* 1000);
		
			return fpga_runtime_total* 1000;

	// status = clEnqueueReadBuffer(queue_processEdges,tmpVertexProp_device,CL_TRUE,0,sizeof(PROP_TYPE) * vertexNum,tmpVertexProp,0,NULL,NULL);
	// if (status != CL_SUCCESS){
	// 	cout << "writing tmpVertexProp table into buffer failed" << endl;
	// 	exit(1);
	// }
}
void set_kernels(){
	//create memory on device 
    int argvi = 0;
	argvi = 0;
	// clSetKernelArgSVMPointerAltera(kernel_readEdges, argvi++, (void*)vertexScore_device);
	// clSetKernelArgSVMPointerAltera(kernel_readEdges, argvi++, (void*)edgeScoreMap);
	// clSetKernelArgSVMPointerAltera(kernel_readEdges, argvi++, (void*)edgesTuples);
	// clSetKernelArgSVMPointerAltera(kernel_readEdges, argvi++, (void*)read_info);
	
	clSetKernelArg(kernel_readEdges,argvi ++,sizeof(cl_mem),&vertexScore_device);
	clSetKernelArg(kernel_readEdges,argvi ++,sizeof(cl_mem),&edgeScoreMap_device);
	clSetKernelArg(kernel_readEdges,argvi ++,sizeof(cl_mem),&edgesTuples_device);
	clSetKernelArg(kernel_readEdges,argvi ++,sizeof(cl_mem),&read_info_device);
	printf("argvi %d \n", argvi);
	argvi = 0;
	clSetKernelArg(kernel_processEdges,argvi ++,sizeof(cl_mem),&tmpVertexProp_device);
	clSetKernelArg(kernel_processEdges,argvi ++,sizeof(cl_mem),&sinkRange_device);
	//clSetKernelArgSVMPointerAltera(kernel_processEdges, argvi++, (void*)tmpVertexProp);
	//clSetKernelArgSVMPointerAltera(kernel_processEdges, argvi++, (void*)sinkRange);
	printf("argvi %d \n", argvi);

	argvi = 0;
	clSetKernelArg(kernel_vertexApply, argvi++, sizeof(cl_mem), &vertexProp_device);
	clSetKernelArg(kernel_vertexApply, argvi++, sizeof(cl_mem), &tmpVertexProp_device);
	clSetKernelArg(kernel_vertexApply, argvi++, sizeof(cl_mem), &outDeg_device);
	clSetKernelArg(kernel_vertexApply, argvi++, sizeof(cl_mem), &vertexScore_device);
	clSetKernelArg(kernel_vertexApply, argvi++, sizeof(cl_mem), &error_device);

	clSetKernelArg(kernel_vertexApply, argvi++, sizeof(int), (void*)&vertexNum);
	clSetKernelArg(kernel_vertexApply, argvi++, sizeof(int), (void*)&base_score);
}
double fpgaApplyPhrase(){
	write_device_DDR_vertex_apply();
	const double begin = getCurrentTimestamp();
	status = clEnqueueTask(queue_vertexApply, kernel_vertexApply, 0, NULL, NULL);
	checkStatus("Failed to launch vertexApply.");
	clFinish(queue_vertexApply);
	const double end = getCurrentTimestamp();
	printf("[INFO] FPGA apply phrase runtime is %f ms \n", (end - begin) * 1000);
	return (end - begin) * 1000;
}

double fpgaProcessing(
	CSR* csr,
	std::vector<CSR_BLOCK*> &blkVec, 
	PROP_TYPE* hybridProp, 
	int &blkNum,
	const int &vertexNum,
	const int &edgeNum,
	const int mode // 1 is single thread, 2 is multi-thread
		)
{	
	double runtime = 0;

	double t1 = getCurrentTimestamp();
	col_partition_muli_partition(csr);
	double t2 = getCurrentTimestamp();
  	double elapsedTime = (t2 - t1) * 1000;
	std::cout << "[INFO] partition takes " << elapsedTime << " ms." << std::endl;

	//for(int i = 0; i < 1; i ++){

    //process_edges_cpu();
	double edge_process_time = launchFPGA();

	#if 0
	int error = 0;
	#pragma omp parallel for reduction(+:error)
	for(int i = 0; i < vertexNum; i++){
		PROP_TYPE tProp = tmpVertexProp[i];
		PROP_TYPE old_score = vertexProp[i];
		vertexProp[i] = base_score + kDamp * tProp;
		error += fabs(vertexProp[i] - old_score);
		tmpVertexProp[i] = 0;
		if(outDeg[i] > 0) vertexScore[i] = vertexProp[i]/outDeg[i];
	}	
	#else 

	double apply_time = fpgaApplyPhrase();


	#endif

	status = clEnqueueReadBuffer(queue_processEdges,error_device,CL_TRUE,0,sizeof(int) ,error,0,NULL,NULL);
	if (status != CL_SUCCESS){
		cout << "writing tmpVertexProp table into buffer failed" << endl;
		exit(1);
	}
	printf(" %2d    %lf\n", itNum[0], int2float(error[0]));

	//}
	return (edge_process_time + apply_time);//*1.0/CLOCKS_PER_SEC;
}

// Init the variables for a new processing.
void processInit(
	const int &vertexNum,
	const int &edgeNum,
	const int &source
	)
{
	eop[0] = 0;

	float init_score_float = 1.0f / vertexNum;
	int init_score_int = float2int(init_score_float);

	for(int i = 0; i < vertexNum; i++){
		vertexProp[i] = init_score_int;
		tmpVertexProp[i] = 0;//init_score_int;
		activeVertices[i] = i;
		if(outDeg[i] > 0) vertexScore[i] = vertexProp[i]/outDeg[i];
	}

	printf("init_score original %f \n",init_score_float);
	printf("init_score original to int %d \n",init_score_int);
	printf("init_score after int %f\n", int2float(init_score_int));
	activeVertexNum[0] = vertexNum;
	//activeVertexNum[0] = 0;
}

void csrPartition(
	CSR* csr,
	std::vector<CSR_BLOCK*> &blkVec,
	const int &blkNum
	)
{
	std::cout << "The graph is divided into " << blkNum * blkNum << " partitions\n";
	for(int cordx = 0; cordx < blkNum; cordx++){
		for(int cordy = 0; cordy < blkNum; cordy++){
			CSR_BLOCK* csrBlkPtr = new CSR_BLOCK(cordx, cordy, csr);
			blkVec.push_back(csrBlkPtr);
			// find the partition with max degree
			if(csrBlkPtr->edgeNum / BLK_SIZE > 16) printf("cordx %d, cordy %d \n", cordx, cordy);
			if(csrBlkPtr->edgeNum > max_partition_degree){
				max_partition_degree = csrBlkPtr->edgeNum;
				fpga_partition_x = cordx;
				fpga_partition_y = cordy;
				printf("fpga_partition_x %d, fpga_partition_y %d, max_partition_degree %d \n",fpga_partition_x, fpga_partition_y,max_partition_degree);
			}
		}
	}
}



// CPU thread related to main function 
int main(int argc, char **argv) {
	double begin;
	double end;
	double elapsedTime;
	int startVertexIdx;
	std::string gName = "lj1";
	std::string mode = "de5_run"; // or harp

	if(gName == "youtube")    startVertexIdx = 320872;
	if(gName == "lj1")        startVertexIdx = 3928512;
	if(gName == "pokec")      startVertexIdx = 182045;
	if(gName == "rmat-19-32") startVertexIdx = 104802;
	if(gName == "rmat-21-32") startVertexIdx = 365723;

	edge_replication_factor = 20;
	Graph* gptr = createGraph(gName, mode);
	csr = new CSR(*gptr);
	vertexNum = csr->vertexNum;
	edgeNum   = csr->edgeNum;
	free(gptr);

	PROP_TYPE *swProp      = (PROP_TYPE*)malloc(vertexNum * sizeof(PROP_TYPE));
	PROP_TYPE *ptProp      = (PROP_TYPE*)malloc(vertexNum * sizeof(PROP_TYPE));
	PROP_TYPE *hybridProp  = (PROP_TYPE*)malloc(vertexNum * sizeof(PROP_TYPE));

	blkNum = (vertexNum + BLK_SIZE - 1)/BLK_SIZE;
	printf("blkNum %d, ceil num %d \n", blkNum, (int)ceil(static_cast<double>(vertexNum) / BLK_SIZE));

	// init fpga
	setHardwareEnv();
	globalVarInit(csr, vertexNum, edgeNum);
	setKernelEnv();
	createKernels(vertexNum, edgeNum);
	set_kernels();
	//kernelVarMap(vertexNum, edgeNum);

	//software processing on CPU
	std::cout << "software PageRank starts." << std::endl;
	processInit(vertexNum, edgeNum, startVertexIdx);
	begin = getCurrentTimestamp();
	singleThreadSWProcessing(csr, blkVec, ptProp, blkNum, vertexNum, startVertexIdx);
	end = getCurrentTimestamp();
	elapsedTime = (end - begin) * 1000;
	std::cout << "[INFO] singleThreadSWProcessing PR takes " << elapsedTime << " ms." << std::endl;
	printf("\n");


	// std::cout << "edgeProcessingCPU starts." << std::endl;
	// processInit(vertexNum, edgeNum, startVertexIdx);
	// begin = getCurrentTimestamp();
	// edgeProcessingCPU(csr, blkVec, ptProp, blkNum, vertexNum, startVertexIdx);
	// end = getCurrentTimestamp();
	// elapsedTime = (end - begin) * 1000;
	// std::cout << "[INFO] ptProcessing PR takes " << elapsedTime << " ms." << std::endl;
	// printf("\n");
	
	std::cout << "fpga processing." << std::endl;	
	processInit(vertexNum, edgeNum, startVertexIdx);	
	elapsedTime = fpgaProcessing(csr, blkVec, hybridProp, blkNum, vertexNum, edgeNum, 2);
	std::cout << "[INFO] fpga processing takes " << elapsedTime << " ms." << std::endl;
	
	freeResources();

	return 0;
}

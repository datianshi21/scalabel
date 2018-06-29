package main

import (
	"flag"
	"gopkg.in/yaml.v2"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path"
	"fmt"
)

var (
	Trace      *log.Logger
	Info       *log.Logger
	Warning    *log.Logger
	Error      *log.Logger
	configPath string
)

// Stores the config info found in config.yml
type Env struct {
	Port      int    `yaml:"port"`
	DataDir   string `yaml:"data"`
	SrcPath   string `yaml:"src"`
	AppSubDir string `yaml:"appSubDir"`
}

func (env Env) AppDir() string {
	return path.Join(env.SrcPath, env.AppSubDir)
}

func (env Env) CreatePath() string {
	return path.Join(env.AppDir(), "control/create.html")
}

func (env Env) DashboardPath() string {
	return path.Join(env.AppDir(), "control/dashboard.html")
}

func (env Env) VendorPath() string {
	return path.Join(env.AppDir(), "control/vendor.html")
}

func (env Env) VideoPath() string {
	return path.Join(env.AppDir(), "annotation/video.html")
}

func (env Env) Box2dPath() string {
	return path.Join(env.AppDir(), "annotation/box.html")
}

func (env Env) Seg2dPath() string {
	return path.Join(env.AppDir(), "annotation/seg.html")
}

func (env Env) Lane2dPath() string {
	return path.Join(env.AppDir(), "annotation/seg.html")
}

func (env Env) PointCloudPath() string {
	return path.Join(env.AppDir(), "annotation/point_cloud.html")
}

func Init(
// Initialize all the loggers
	traceHandle io.Writer,
	infoHandle io.Writer,
	warningHandle io.Writer,
	errorHandle io.Writer) {
	Trace = log.New(traceHandle,
		"TRACE: ",
		log.Ldate|log.Ltime)

	Info = log.New(infoHandle,
		"INFO: ",
		log.Ldate|log.Ltime)

	Warning = log.New(warningHandle,
		"WARNING: ",
		log.Ldate|log.Ltime)

	Error = log.New(errorHandle,
		"ERROR: ",
		log.Ldate|log.Ltime)

	// Handle the flags (right now only have config path)
	flag.StringVar(&configPath, "config", "", "Path to config.yml")
	flag.Parse()
	if configPath == "" {
		log.Fatal("Must include --config flag with path to config.yml")
	}
}

// Initialize the environment from the config file
func NewEnv() *Env {
	env := new(Env)
	// read config file
	cfg, err := ioutil.ReadFile(configPath)
	Info.Printf("Configuration:\n%s", cfg)
	if err != nil {
		log.Fatal(err)
	}
	err = yaml.Unmarshal(cfg, &env)
	if err != nil {
		log.Fatal(err)
	}
	if env.AppSubDir == "" {
		env.AppSubDir = "app/src"
	}
	return env
}

var env Env

func main() {
	Init(ioutil.Discard, os.Stdout, os.Stdout, os.Stderr)

	Error.SetFlags(log.LstdFlags | log.Llongfile)

	env = *NewEnv()

	// flow control handlers
	//http.HandleFunc("/", parse(indexHandler))
	http.HandleFunc("/", WrapHandler(http.FileServer(
		http.Dir(path.Join(env.SrcPath, env.AppSubDir)))))
	http.HandleFunc("/dashboard", WrapHandleFunc(dashboardHandler))
	http.HandleFunc("/vendor", WrapHandleFunc(vendorHandler))
	http.HandleFunc("/postProject", WrapHandleFunc(postProjectHandler))
	http.HandleFunc("/postSave", WrapHandleFunc(postSaveHandler))
	http.HandleFunc("/postExport", WrapHandleFunc(postExportHandler))
	http.HandleFunc("/postDownloadTaskURL", WrapHandleFunc(downloadTaskURLHandler))
	http.HandleFunc("/postLoadAssignment",
		WrapHandleFunc(postLoadAssignmentHandler))

	// Simple static handlers can be generated with MakePathHandleFunc
	http.HandleFunc("/create",
		WrapHandleFunc(MakePathHandleFunc(env.CreatePath())))
	http.HandleFunc("/2d_seg_labeling", WrapHandleFunc(seg2dLabelingHandler))
	http.HandleFunc("/2d_lane_labeling", WrapHandleFunc(lane2dLabelingHandler))
	//http.HandleFunc("/image_labeling",
	//	MakePathHandleFunc(path.Join(appDir, "/annotation/image.html")))

	// labeling handlers
	http.HandleFunc("/2d_bbox_labeling", WrapHandleFunc(box2dLabelingHandler))
	http.HandleFunc("/video_bbox_labeling", WrapHandleFunc(videoLabelingHandler))
	http.HandleFunc("/point_cloud_labeling", WrapHandleFunc(pointCloudLabelingHandler))

	Info.Printf("Listening to Port %d", env.Port)
	Info.Printf("Local URL: localhost:%d", env.Port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", env.Port), nil))
}

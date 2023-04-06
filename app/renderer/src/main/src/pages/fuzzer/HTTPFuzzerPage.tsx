import React, {useEffect, useRef, useState} from "react"
import {
    Button,
    Card,
    Col,
    Form,
    Input,
    Modal,
    notification,
    Result,
    Row,
    Space,
    Spin,
    Tag,
    Typography,
    Popover,
    Checkbox,
    Tooltip,
    InputNumber,
    Divider,
    Collapse
} from "antd"
import {HTTPPacketEditor, IMonacoEditor} from "../../utils/editors"
import {showDrawer, showModal} from "../../utils/showModal"
import {monacoEditorWrite} from "./fuzzerTemplates"
import {StringFuzzer} from "./StringFuzzer"
import {InputFloat, InputInteger, InputItem, OneLine, SelectOne, SwitchItem} from "../../utils/inputUtil"
import {FuzzerResponseToHTTPFlowDetail} from "../../components/HTTPFlowDetail"
import {randomString} from "../../utils/randomUtil"
import {DeleteOutlined, ProfileOutlined} from "@ant-design/icons"
import {HTTPFuzzerResultsCard} from "./HTTPFuzzerResultsCard"
import {failed, info} from "../../utils/notification"
import {AutoSpin} from "../../components/AutoSpin"
import {ResizeBox} from "../../components/ResizeBox"
import {useGetState, useMemoizedFn, useUpdateEffect} from "ahooks"
import {getRemoteValue, getLocalValue, setLocalValue, setRemoteValue} from "../../utils/kv"
import {HTTPFuzzerHistorySelector, HTTPFuzzerTaskDetail} from "./HTTPFuzzerHistory"
import {PayloadManagerPage} from "../payloadManager/PayloadManager"
import {HackerPlugin} from "../hacker/HackerPlugin"
import {fuzzerInfoProp} from "../MainOperator"
import {ItemSelects} from "../../components/baseTemplate/FormItemUtil"
import {HTTPFuzzerHotPatch} from "./HTTPFuzzerHotPatch"
import {AutoCard} from "../../components/AutoCard"
import {callCopyToClipboard} from "../../utils/basic"
import {exportHTTPFuzzerResponse, exportPayloadResponse} from "./HTTPFuzzerPageExport"
import {StringToUint8Array, Uint8ArrayToString} from "../../utils/str"
import {insertFileFuzzTag, insertTemporaryFileFuzzTag} from "./InsertFileFuzzTag"
import {PacketScanButton} from "@/pages/packetScanner/DefaultPacketScanGroup"
import styles from "./HTTPFuzzerPage.module.scss"
import {ShareData} from "./components/ShareData"
import {showExtractFuzzerResponseOperator} from "@/utils/extractor"
import {SearchOutlined} from "@ant-design/icons/lib"
import {
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChromeSvgIcon,
    ClockIcon,
    PaperAirplaneIcon,
    PlusSmIcon
} from "@/assets/newIcon"
import classNames from "classnames"
import {PaginationSchema} from "../invoker/schema"
import {editor} from "monaco-editor"
import {showResponseViaResponseRaw} from "@/components/ShowInBrowser"
import {ResizeCardBox} from "@/components/ResizeCardBox/ResizeCardBox"
import {YakitSwitch} from "@/components/yakitUI/YakitSwitch/YakitSwitch"
import {YakitCheckbox} from "@/components/yakitUI/YakitCheckbox/YakitCheckbox"
import {YakitTag} from "@/components/yakitUI/YakitTag/YakitTag"
import {YakitButton} from "@/components/yakitUI/YakitButton/YakitButton"
import {YakitSpin} from "@/components/yakitUI/YakitSpin/YakitSpin"
import {YakitInput} from "@/components/yakitUI/YakitInput/YakitInput"
import {YakitInputNumber} from "@/components/yakitUI/YakitInputNumber/YakitInputNumber"
import {YakitAutoComplete} from "@/components/yakitUI/YakitAutoComplete/YakitAutoComplete"
import {YakitSelect} from "@/components/yakitUI/YakitSelect/YakitSelect"
import {YakitRadioButtons} from "@/components/yakitUI/YakitRadioButtons/YakitRadioButtons"
import {RuleContent} from "../mitm/MITMRule/MITMRuleFromModal"
import {showYakitModal} from "@/components/yakitUI/YakitModal/YakitModalConfirm"

const {ipcRenderer} = window.require("electron")
const {Panel} = Collapse

interface ShareValueProps {
    isHttps: boolean
    advancedConfig: boolean
    advancedConfiguration: AdvancedConfigurationProps
    request: any
}

interface AdvancedConfigurationProps {
    forceFuzz: boolean
    concurrent: number
    isHttps: boolean
    noFixContentLength: boolean
    proxy: string
    actualHost: string
    timeout: number
    minDelaySeconds: number
    maxDelaySeconds: number
    _filterMode: "drop" | "match"
    getFilter: FuzzResponseFilter
}

export const analyzeFuzzerResponse = (
    i: FuzzerResponse,
    setRequest: (isHttps: boolean, request: string) => any,
    index?: number,
    data?: FuzzerResponse[]
) => {
    let m = showDrawer({
        width: "90%",
        content: (
            <>
                <FuzzerResponseToHTTPFlowDetail
                    response={i}
                    onClosed={() => {
                        m.destroy()
                    }}
                    index={index}
                    data={data}
                />
            </>
        )
    })
}

export interface HTTPFuzzerPageProp {
    isHttps?: boolean
    request?: string
    system?: string
    order?: string
    fuzzerParams?: fuzzerInfoProp
    shareContent?: string
}

const Text = Typography.Text

export interface FuzzerResponse {
    Method: string
    StatusCode: number
    Host: string
    ContentType: string
    Headers: {Header: string; Value: string}[]
    ResponseRaw: Uint8Array
    RequestRaw: Uint8Array
    BodyLength: number
    UUID: string
    Timestamp: number
    DurationMs: number

    Ok: boolean
    Reason: string
    Payloads?: string[]

    IsHTTPS?: boolean
    Count?: number

    HeaderSimilarity?: number
    BodySimilarity?: number
    MatchedByFilter?: boolean
    Url?: string
}

const defaultPostTemplate = `POST / HTTP/1.1
Content-Type: application/json
Host: www.example.com

{"key": "value"}`

export const WEB_FUZZ_PROXY = "WEB_FUZZ_PROXY"
const WEB_FUZZ_HOTPATCH_CODE = "WEB_FUZZ_HOTPATCH_CODE"
const WEB_FUZZ_HOTPATCH_WITH_PARAM_CODE = "WEB_FUZZ_HOTPATCH_WITH_PARAM_CODE"

export interface HistoryHTTPFuzzerTask {
    Request: string
    RequestRaw: Uint8Array
    Proxy: string
    IsHTTPS: boolean

    // 展示渲染，一般来说 Verbose > RequestRaw > Request
    Verbose?: string
}

export const showDictsAndSelect = (res: (i: string) => any) => {
    const m = showModal({
        title: "选择想要插入的字典",
        width: 1200,
        content: (
            <div style={{width: 1100, height: 500, overflow: "hidden"}}>
                <PayloadManagerPage
                    readOnly={true}
                    selectorHandle={(e) => {
                        res(e)
                        m.destroy()
                    }}
                />
            </div>
        )
    })
}

interface FuzzResponseFilter {
    MinBodySize: number
    MaxBodySize: number
    Regexps: string[]
    Keywords: string[]
    StatusCode: string[]
}

function removeEmptyFiledFromFuzzResponseFilter(i: FuzzResponseFilter): FuzzResponseFilter {
    i.Keywords = (i.Keywords || []).filter((i) => !!i)
    i.StatusCode = (i.StatusCode || []).filter((i) => !!i)
    i.Regexps = (i.Regexps || []).filter((i) => !!i)
    return {...i}
}

function filterIsEmpty(f: FuzzResponseFilter): boolean {
    return (
        f.MinBodySize === 0 &&
        f.MaxBodySize === 0 &&
        f.Regexps.length === 0 &&
        f.Keywords.length === 0 &&
        f.StatusCode.length === 0
    )
}

function copyAsUrl(f: {Request: string; IsHTTPS: boolean}) {
    ipcRenderer
        .invoke("ExtractUrl", f)
        .then((data: {Url: string}) => {
            callCopyToClipboard(data.Url)
        })
        .catch((e) => {
            failed("复制 URL 失败：包含 Fuzz 标签可能会导致 URL 不完整")
        })
}

export const newWebFuzzerTab = (isHttps: boolean, request: string) => {
    return ipcRenderer
        .invoke("send-to-tab", {
            type: "fuzzer",
            data: {isHttps: isHttps, request: request}
        })
        .then(() => {
            info("新开 WebFuzzer Tab")
        })
}

const ALLOW_MULTIPART_DATA_ALERT = "ALLOW_MULTIPART_DATA_ALERT"

const emptyFuzzer = {
    BodyLength: 0,
    BodySimilarity: 0,
    ContentType: "",
    Count: 0,
    DurationMs: 0,
    HeaderSimilarity: 0,
    Headers: [],
    Host: "",
    IsHTTPS: false,
    MatchedByFilter: false,
    Method: "",
    Ok: false,
    Payloads: [],
    Reason: "",
    RequestRaw: new Uint8Array(),
    ResponseRaw: new Uint8Array(),
    StatusCode: 0,
    Timestamp: 0,
    UUID: ""
}

export const HTTPFuzzerPage: React.FC<HTTPFuzzerPageProp> = (props) => {
    // params
    const [isHttps, setIsHttps, getIsHttps] = useGetState<boolean>(
        props.fuzzerParams?.isHttps || props.isHttps || false
    )
    const [noFixContentLength, setNoFixContentLength] = useState(false)
    const [request, setRequest, getRequest] = useGetState(
        props.fuzzerParams?.request || props.request || defaultPostTemplate
    )

    const [concurrent, setConcurrent] = useState(props.fuzzerParams?.concurrent || 20)
    const [forceFuzz, setForceFuzz] = useState<boolean>(props.fuzzerParams?.forceFuzz || true)
    const [timeout, setParamTimeout] = useState(props.fuzzerParams?.timeout || 30.0)
    const [minDelaySeconds, setMinDelaySeconds] = useState<number>(0)
    const [maxDelaySeconds, setMaxDelaySeconds] = useState<number>(0)
    const [proxy, setProxy] = useState<string>(props.fuzzerParams?.proxy || "")
    const [actualHost, setActualHost] = useState<string>(props.fuzzerParams?.actualHost || "")
    const [advancedConfig, setAdvancedConfig] = useState(true)
    const [redirectedResponse, setRedirectedResponse] = useState<FuzzerResponse>()
    const [historyTask, setHistoryTask] = useState<HistoryHTTPFuzzerTask>()
    const [hotPatchCode, setHotPatchCode] = useState<string>("")
    const [hotPatchCodeWithParamGetter, setHotPatchCodeWithParamGetter] = useState<string>("")
    const [affixSearch, setAffixSearch] = useState("")
    const [defaultResponseSearch, setDefaultResponseSearch] = useState("")

    const [currentSelectId, setCurrentSelectId] = useState<number>() // 历史中选中的记录id

    // filter
    const [_, setFilter, getFilter] = useGetState<FuzzResponseFilter>({
        Keywords: [],
        MaxBodySize: 0,
        MinBodySize: 0,
        Regexps: [],
        StatusCode: []
    })
    const [_filterMode, setFilterMode, getFilterMode] = useGetState<"drop" | "match">("drop")
    const [droppedCount, setDroppedCount] = useState(0)

    // state
    const [loading, setLoading] = useState(false)

    /*
     * 内容
     * */
    // const [content, setContent] = useState<FuzzerResponse[]>([])
    const [_firstResponse, setFirstResponse, getFirstResponse] = useGetState<FuzzerResponse>(emptyFuzzer)
    const [successFuzzer, setSuccessFuzzer] = useState<FuzzerResponse[]>([])
    const [failedFuzzer, setFailedFuzzer] = useState<FuzzerResponse[]>([])
    const [_successCount, setSuccessCount, getSuccessCount] = useGetState(0)
    const [_failedCount, setFailedCount, getFailedCount] = useGetState(0)

    /**/
    const [reqEditor, setReqEditor] = useState<IMonacoEditor>()
    const [fuzzToken, setFuzzToken] = useState("")
    const [search, setSearch] = useState("")
    const [targetUrl, setTargetUrl] = useState("")

    const [refreshTrigger, setRefreshTrigger] = useState(false)
    const refreshRequest = () => {
        setRefreshTrigger(!refreshTrigger)
    }
    const [urlPacketShow, setUrlPacketShow] = useState<boolean>(false)

    // filter
    const [keyword, setKeyword] = useState<string>("")
    const [filterContent, setFilterContent] = useState<FuzzerResponse[]>([])
    const [timer, setTimer] = useState<any>()

    useEffect(() => {
        if (props.shareContent) {
            setUpShareContent(JSON.parse(props.shareContent))
        }
    }, [props.shareContent])

    useEffect(() => {
        getLocalValue(WEB_FUZZ_HOTPATCH_CODE).then((data: any) => {
            if (!data) {
                getRemoteValue(WEB_FUZZ_HOTPATCH_CODE).then((remoteData) => {
                    if (!remoteData) {
                        return
                    }
                    setHotPatchCode(`${remoteData}`)
                })
                return
            }
            setHotPatchCode(`${data}`)
        })

        getRemoteValue(WEB_FUZZ_HOTPATCH_WITH_PARAM_CODE).then((remoteData) => {
            if (!!remoteData) {
                setHotPatchCodeWithParamGetter(`${remoteData}`)
            }
        })
    }, [])

    // 定时器
    const sendTimer = useRef<any>(null)
    const resetResponse = useMemoizedFn(() => {
        setFirstResponse({...emptyFuzzer})
        setSuccessFuzzer([])
        setRedirectedResponse(undefined)
        setFailedFuzzer([])
        setSuccessCount(0)
        setFailedCount(0)
    })

    const sendToFuzzer = useMemoizedFn((isHttps: boolean, request: string) => {
        ipcRenderer.invoke("send-to-tab", {
            type: "fuzzer",
            data: {isHttps: isHttps, request: request}
        })
    })
    const sendToPlugin = useMemoizedFn((request: Uint8Array, isHTTPS: boolean, response?: Uint8Array) => {
        let m = showDrawer({
            width: "80%",
            content: <HackerPlugin request={request} isHTTPS={isHTTPS} response={response}></HackerPlugin>
        })
    })

    // 从历史记录中恢复
    useEffect(() => {
        if (!historyTask) {
            return
        }
        if (historyTask.Request === "") {
            setRequest(Uint8ArrayToString(historyTask.RequestRaw, "utf8"))
        } else {
            setRequest(historyTask.Request)
        }
        setIsHttps(historyTask.IsHTTPS)
        setProxy(historyTask.Proxy)
        refreshRequest()
    }, [historyTask])

    useEffect(() => {
        // 缓存全局参数(将fuzz参数的缓存从本地文件替换到引擎数据库内)
        getLocalValue(WEB_FUZZ_PROXY).then((e) => {
            if (e) {
                setLocalValue(WEB_FUZZ_PROXY, "")
                setRemoteValue(WEB_FUZZ_PROXY, `${e}`)
                setProxy(`${e}`)
            } else {
                getRemoteValue(WEB_FUZZ_PROXY).then((e) => {
                    if (!e) {
                        return
                    }
                    setProxy(`${e}`)
                })
            }
        })
    }, [])

    useEffect(() => {
        setIsHttps(!!props.isHttps)
        if (props.request) {
            setRequest(props.request)
            resetResponse()
        }
    }, [props.isHttps, props.request])

    const loadHistory = useMemoizedFn((id: number) => {
        resetResponse()
        setHistoryTask(undefined)
        setLoading(true)
        setDroppedCount(0)
        ipcRenderer.invoke("HTTPFuzzer", {HistoryWebFuzzerId: id}, fuzzToken).then(() => {
            ipcRenderer
                .invoke("GetHistoryHTTPFuzzerTask", {Id: id})
                .then((data: {OriginRequest: HistoryHTTPFuzzerTask}) => {
                    setHistoryTask(data.OriginRequest)
                    setCurrentSelectId(id)
                })
        })
    })

    const submitToHTTPFuzzer = useMemoizedFn(() => {
        // 清楚历史任务的标记
        setHistoryTask(undefined)

        // 更新默认搜索
        setDefaultResponseSearch(affixSearch)

        // saveValue(WEB_FUZZ_PROXY, proxy)
        setLoading(true)
        setDroppedCount(0)
        ipcRenderer.invoke(
            "HTTPFuzzer",
            {
                // Request: request,
                RequestRaw: Buffer.from(request, "utf8"), // StringToUint8Array(request, "utf8"),
                ForceFuzz: forceFuzz,
                IsHTTPS: isHttps,
                Concurrent: concurrent,
                PerRequestTimeoutSeconds: timeout,
                NoFixContentLength: noFixContentLength,
                Proxy: proxy,
                ActualAddr: actualHost,
                HotPatchCode: hotPatchCode,
                HotPatchCodeWithParamGetter: hotPatchCodeWithParamGetter,
                Filter: {
                    ...getFilter(),
                    StatusCode: getFilter().StatusCode.filter((i) => !!i),
                    Keywords: getFilter().Keywords.filter((i) => !!i),
                    Regexps: getFilter().Regexps.filter((i) => !!i)
                },
                DelayMinSeconds: minDelaySeconds,
                DelayMaxSeconds: maxDelaySeconds
            },
            fuzzToken
        )
    })

    const cancelCurrentHTTPFuzzer = useMemoizedFn(() => {
        ipcRenderer.invoke("cancel-HTTPFuzzer", fuzzToken)
    })

    useEffect(() => {
        const token = randomString(60)
        setFuzzToken(token)

        const dataToken = `${token}-data`
        const errToken = `${token}-error`
        const endToken = `${token}-end`

        /*
         * successCount
         * failedCount
         * */
        let successCount = 0
        let failedCount = 0

        ipcRenderer.on(errToken, (e, details) => {
            notification["error"]({
                message: `提交模糊测试请求失败 ${details}`,
                placement: "bottomRight"
            })
        })
        let successBuffer: FuzzerResponse[] = []
        let failedBuffer: FuzzerResponse[] = []
        let droppedCount = 0
        let count: number = 0
        let lastUpdateCount: number = 0
        const updateData = () => {
            if (count <= 0) {
                return
            }

            if (failedBuffer.length + successBuffer.length === 0) {
                return
            }

            if (lastUpdateCount <= 0 || lastUpdateCount != count || count === 1) {
                // setContent([...buffer])
                setSuccessFuzzer([...successBuffer])
                setFailedFuzzer([...failedBuffer])
                setFailedCount(failedCount)
                setSuccessCount(successCount)
                lastUpdateCount = count
            }
        }

        ipcRenderer.on(dataToken, (e: any, data: any) => {
            if (data.Ok) {
                successCount++
            } else {
                failedCount++
            }

            if (!filterIsEmpty(getFilter())) {
                // 设置了 Filter
                const hit = data["MatchedByFilter"] === true
                // 丢包的条件：
                //   1. 命中过滤器，同时过滤模式设置为丢弃
                //   2. 未命中过滤器，过滤模式设置为保留
                if ((hit && getFilterMode() === "drop") || (!hit && getFilterMode() === "match")) {
                    // 丢弃不匹配的内容
                    droppedCount++
                    setDroppedCount(droppedCount)
                    return
                }
            }
            const r = {
                StatusCode: data.StatusCode,
                Ok: data.Ok,
                Reason: data.Reason,
                Method: data.Method,
                Host: data.Host,
                ContentType: data.ContentType,
                Headers: (data.Headers || []).map((i: any) => {
                    return {Header: i.Header, Value: i.Value}
                }),
                DurationMs: data.DurationMs,
                BodyLength: data.BodyLength,
                UUID: data.UUID,
                Timestamp: data.Timestamp,
                ResponseRaw: data.ResponseRaw,
                RequestRaw: data.RequestRaw,
                Payloads: data.Payloads,
                IsHTTPS: data.IsHTTPS,
                Count: count,
                BodySimilarity: data.BodySimilarity,
                HeaderSimilarity: data.HeaderSimilarity,
                Url: data.Url
            } as FuzzerResponse

            // 设置第一个 response
            if (getFirstResponse().RequestRaw.length === 0) {
                setFirstResponse(r)
            }

            if (data.Ok) {
                successBuffer.push(r)
            } else {
                failedBuffer.push(r)
            }
            count++
            // setContent([...buffer])
        })
        ipcRenderer.on(endToken, () => {
            updateData()
            successBuffer = []
            failedBuffer = []
            count = 0
            droppedCount = 0
            lastUpdateCount = 0
            setLoading(false)
        })

        const updateDataId = setInterval(() => {
            updateData()
        }, 200)

        return () => {
            ipcRenderer.invoke("cancel-HTTPFuzzer", token)

            clearInterval(updateDataId)
            ipcRenderer.removeAllListeners(errToken)
            ipcRenderer.removeAllListeners(dataToken)
            ipcRenderer.removeAllListeners(endToken)
        }
    }, [])

    const searchContent = (keyword: string) => {
        if (timer) {
            clearTimeout(timer)
            setTimer(null)
        }
        setTimer(
            setTimeout(() => {
                try {
                    const filters = successFuzzer.filter((item) => {
                        return Buffer.from(item.ResponseRaw).toString("utf8").match(new RegExp(keyword, "g"))
                    })
                    setFilterContent(filters)
                } catch (error) {}
            }, 500)
        )
    }

    useEffect(() => {
        if (!!keyword) {
            searchContent(keyword)
        } else {
            setFilterContent([])
        }
    }, [keyword])

    useEffect(() => {
        if (keyword && successFuzzer.length !== 0) {
            const filters = successFuzzer.filter((item) => {
                return Buffer.from(item.ResponseRaw).toString("utf8").match(new RegExp(keyword, "g"))
            })
            setFilterContent(filters)
        }
    }, [successFuzzer])

    const onlyOneResponse = !loading && failedFuzzer.length + successFuzzer.length === 1

    const sendFuzzerSettingInfo = useMemoizedFn(() => {
        const info: fuzzerInfoProp = {
            time: new Date().getTime().toString(),
            isHttps: isHttps,
            forceFuzz: forceFuzz,
            concurrent: concurrent,
            proxy: proxy,
            actualHost: actualHost,
            timeout: timeout,
            request: request
        }
        if (sendTimer.current) {
            clearTimeout(sendTimer.current)
            sendTimer.current = null
        }
        sendTimer.current = setTimeout(() => {
            ipcRenderer.invoke("send-fuzzer-setting-data", {key: props.order || "", param: JSON.stringify(info)})
        }, 1000)
    })
    useEffect(() => {
        sendFuzzerSettingInfo()
    }, [isHttps, forceFuzz, concurrent, proxy, actualHost, timeout, request])

    const responseViewer = useMemoizedFn((rsp: FuzzerResponse) => {
        let reason = "未知原因"
        try {
            reason = rsp!.Reason
        } catch (e) {}
        return (
            <HTTPPacketEditor
                title={
                    <Form
                        size={"small"}
                        layout={"inline"}
                        onSubmitCapture={(e) => {
                            e.preventDefault()

                            setDefaultResponseSearch(affixSearch)
                        }}
                    >
                        <InputItem
                            width={150}
                            allowClear={true}
                            label={""}
                            value={affixSearch}
                            placeholder={"搜索定位响应"}
                            suffixNode={
                                <Button size={"small"} type='link' htmlType='submit' icon={<SearchOutlined />} />
                            }
                            setValue={(value) => {
                                setAffixSearch(value)
                                if (value === "" && defaultResponseSearch !== "") {
                                    setDefaultResponseSearch("")
                                }
                            }}
                            extraFormItemProps={{style: {marginBottom: 0}}}
                        />
                    </Form>
                }
                defaultSearchKeyword={defaultResponseSearch}
                system={props.system}
                originValue={rsp.ResponseRaw}
                bordered={true}
                hideSearch={true}
                isResponse={true}
                noHex={true}
                emptyOr={
                    !rsp?.Ok && (
                        <Result
                            status={
                                reason.includes("tcp: i/o timeout") ||
                                reason.includes("empty response") ||
                                reason.includes("no such host") ||
                                reason.includes("cannot create proxy")
                                    ? "warning"
                                    : "error"
                            }
                            title={"请求失败或服务端（代理）异常"}
                            // no such host
                            subTitle={(() => {
                                const reason = rsp?.Reason || "unknown"
                                if (reason.includes("tcp: i/o timeout")) {
                                    return `网络超时（请检查目标主机是否在线？）`
                                }
                                if (reason.includes("no such host")) {
                                    return `DNS 错误或主机错误 (请检查域名是否可以被正常解析？)`
                                }
                                if (reason.includes("cannot create proxy")) {
                                    return `无法设置代理（请检查代理是否可用）`
                                }
                                if (reason.includes("empty response")) {
                                    return `服务端没有任何返回数据`
                                }
                                return undefined
                            })()}
                        >
                            <>详细原因：{rsp.Reason}</>
                        </Result>
                    )
                }
                readOnly={true}
                extra={
                    <Space size={0}>
                        {loading && <Spin size={"small"} spinning={loading} />}
                        {onlyOneResponse ? (
                            <Space size={0}>
                                {rsp.IsHTTPS && <Tag>{rsp.IsHTTPS ? "https" : ""}</Tag>}
                                <Tag>
                                    {rsp.BodyLength}bytes / {rsp.DurationMs}ms
                                </Tag>
                                <Space key='single'>
                                    <Button
                                        className={styles["extra-chrome-btn"]}
                                        type={"text"}
                                        size={"small"}
                                        icon={<ChromeSvgIcon />}
                                        onClick={() => {
                                            showResponseViaResponseRaw(rsp.ResponseRaw || "")
                                        }}
                                    />
                                    <Button
                                        size={"small"}
                                        onClick={() => {
                                            analyzeFuzzerResponse(rsp, (bool, r) => {
                                                // setRequest(r)
                                                // refreshRequest()
                                            })
                                        }}
                                        type={"primary"}
                                        icon={<ProfileOutlined />}
                                    />
                                    {/*    详情*/}
                                    {/*</Button>*/}
                                    <Button
                                        type={"primary"}
                                        size={"small"}
                                        onClick={() => {
                                            // setContent([])
                                            setSuccessFuzzer([])
                                            setFailedFuzzer([])
                                        }}
                                        danger={true}
                                        icon={<DeleteOutlined />}
                                    />
                                </Space>
                            </Space>
                        ) : (
                            <Space key='list'>
                                <Tag color={"green"}>成功:{getSuccessCount()}</Tag>
                                <Input
                                    size={"small"}
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value)
                                    }}
                                />
                                {/*<Tag>当前请求结果数[{(content || []).length}]</Tag>*/}
                                <Button
                                    size={"small"}
                                    onClick={() => {
                                        // setContent([])
                                        setSuccessFuzzer([])
                                        setFailedFuzzer([])
                                    }}
                                >
                                    清除数据
                                </Button>
                            </Space>
                        )}
                    </Space>
                }
            />
        )
    })

    // 设置最大延迟最小延迟
    useEffect(() => {
        if (minDelaySeconds > maxDelaySeconds) {
            setMaxDelaySeconds(minDelaySeconds)
        }
    }, [minDelaySeconds])

    useEffect(() => {
        if (maxDelaySeconds < minDelaySeconds) {
            setMinDelaySeconds(maxDelaySeconds)
        }
    }, [maxDelaySeconds])

    const hotPatchTrigger = useMemoizedFn(() => {
        let m = showYakitModal({
            title: "调试 / 插入热加载代码",
            width: "80%",
            footer: null,
            content: (
                <div className={styles["http-fuzzer-hotPatch"]}>
                    <HTTPFuzzerHotPatch
                        initialHotPatchCode={hotPatchCode}
                        initialHotPatchCodeWithParamGetter={hotPatchCodeWithParamGetter}
                        onInsert={(tag) => {
                            if (reqEditor) monacoEditorWrite(reqEditor, tag)
                            m.destroy()
                        }}
                        onSaveCode={(code) => {
                            setHotPatchCode(code)
                            setLocalValue(WEB_FUZZ_HOTPATCH_CODE, code)
                            setRemoteValue(WEB_FUZZ_HOTPATCH_CODE, code)
                        }}
                        onSaveHotPatchCodeWithParamGetterCode={(code) => {
                            setHotPatchCodeWithParamGetter(code)
                            setRemoteValue(WEB_FUZZ_HOTPATCH_WITH_PARAM_CODE, code)
                        }}
                    />
                </div>
            )
        })
    })
    const getShareContent = useMemoizedFn((callback) => {
        const params: ShareValueProps = {
            isHttps,
            advancedConfig: advancedConfig,
            request: getRequest(),
            advancedConfiguration: {
                forceFuzz,
                concurrent,
                isHttps,
                noFixContentLength,
                proxy,
                actualHost,
                timeout,
                minDelaySeconds,
                maxDelaySeconds,
                _filterMode: getFilterMode(),
                getFilter: getFilter()
            }
        }
        callback(params)
    })
    const setUpShareContent = useMemoizedFn((shareContent: ShareValueProps) => {
        setIsHttps(shareContent.isHttps)
        setAdvancedConfig(shareContent.advancedConfig)
        setRequest(shareContent.request || defaultPostTemplate)
        setForceFuzz(shareContent.advancedConfiguration.forceFuzz)
        setConcurrent(shareContent.advancedConfiguration.concurrent || 20)
        setNoFixContentLength(shareContent.advancedConfiguration.noFixContentLength)
        setProxy(shareContent.advancedConfiguration.proxy)
        setActualHost(shareContent.advancedConfiguration.actualHost)
        setParamTimeout(shareContent.advancedConfiguration.timeout || 30.0)
        setMinDelaySeconds(shareContent.advancedConfiguration.minDelaySeconds)
        setMaxDelaySeconds(shareContent.advancedConfiguration.maxDelaySeconds)
        setFilterMode(shareContent.advancedConfiguration._filterMode || "drop")
        setFilter(shareContent.advancedConfiguration.getFilter)
    })

    const cachedTotal = successFuzzer.length + failedFuzzer.length
    const [currentPage, setCurrentPage] = useState<number>(0)
    const [total, setTotal] = useState<number>()
    const getList = useMemoizedFn((pageInt: number) => {
        setLoading(true)
        ipcRenderer
            .invoke("QueryHistoryHTTPFuzzerTaskEx", {
                Pagination: {Page: pageInt, Limit: 1}
            })
            .then((data: {Data: HTTPFuzzerTaskDetail[]; Total: number; Pagination: PaginationSchema}) => {
                setTotal(data.Total)
                if (data.Data.length > 0) {
                    loadHistory(data.Data[0].BasicInfo.Id)
                    resetResponse()
                    setHistoryTask(undefined)
                    setDroppedCount(0)
                }
            })
            .catch((err) => {
                failed("加载失败:" + err)
            })
            .finally(() => setTimeout(() => setLoading(false), 300))
    })
    const onPrePage = useMemoizedFn(() => {
        if (currentPage === 0 || currentPage === 1) {
            return
        }
        setCurrentPage(currentPage - 1)
        getList(currentPage - 1)
    })
    const onNextPage = useMemoizedFn(() => {
        if (currentPage == total) {
            return
        }
        setCurrentPage(currentPage + 1)
        getList(currentPage + 1)
    })

    useEffect(() => {
        try {
            if (!reqEditor) {
                return
            }
            reqEditor?.getModel()?.pushEOL(editor.EndOfLineSequence.CRLF)
        } catch (e) {
            failed("初始化 EOL CRLF 失败")
        }
    }, [reqEditor])
    const onInsertYakFuzzer = useMemoizedFn(() => {
        const m = showModal({
            width: "70%",
            content: (
                <>
                    <StringFuzzer
                        advanced={true}
                        disableBasicMode={true}
                        insertCallback={(template: string) => {
                            if (!template) {
                                Modal.warn({
                                    title: "Payload 为空 / Fuzz 模版为空"
                                })
                            } else {
                                if (reqEditor && template) {
                                    reqEditor.trigger("keyboard", "type", {
                                        text: template
                                    })
                                } else {
                                    Modal.error({
                                        title: "BUG: 编辑器失效"
                                    })
                                }
                                m.destroy()
                            }
                        }}
                    />
                </>
            )
        })
    })
    /**
     * @@description 获取高级配置中的Form values
     */
    const onGetFormValue = useMemoizedFn((val: AdvancedConfigValueProps) => {
        console.log("val", val)
        // 请求包配置
        setForceFuzz(val.isHttps)
        setIsHttps(val.isHttps)
        setNoFixContentLength(val.noFixContentLength)
        setActualHost(val.actualHost)
        setParamTimeout(val.timeout)
        // 发包配置
        setConcurrent(val.concurrent)
        setProxy(val.proxy ? val.proxy?.join(",") : "")
        setMinDelaySeconds(val.minDelaySeconds)
        setMaxDelaySeconds(val.maxDelaySeconds)
        // 重试配置
        // maxRetryTimes
        // retryConfiguration
        // noRetryConfiguration
        // 重定向配置
        // redirectCount: 3,
        // redirectConfiguration: undefined,
        // noRedirectConfiguration: undefined,
        // 过滤配置
        setFilterMode(val.filterMode)
        setFilter({
            Keywords: val.keyWord?.split(",") || [],
            MaxBodySize: val.maxBodySize,
            MinBodySize: val.minBodySize,
            Regexps: val.regexps?.split(",") || [],
            StatusCode: val.statusCode?.split(",") || []
        })
    })
    return (
        <div className={styles["http-fuzzer-body"]}>
            <HttpQueryAdvancedConfig
                defAdvancedConfigValue={{
                    // 请求包配置
                    forceFuzz,
                    isHttps,
                    noFixContentLength,
                    actualHost,
                    timeout,
                    // 发包配置
                    concurrent,
                    proxy: proxy ? proxy?.split(",") : [],
                    minDelaySeconds,
                    maxDelaySeconds,
                    // 重试配置
                    maxRetryTimes: 3,
                    retryConfiguration: {
                        statusCode: "",
                        keyWord: ""
                    },
                    noRetryConfiguration: {
                        statusCode: "",
                        keyWord: ""
                    },
                    // 重定向配置
                    redirectCount: 3,
                    redirectConfiguration: {
                        statusCode: "",
                        keyWord: ""
                    },
                    noRedirectConfiguration: {
                        statusCode: "",
                        keyWord: ""
                    },
                    // 过滤配置
                    filterMode: _filterMode,
                    statusCode: getFilter().StatusCode.join(",") || "",
                    regexps: getFilter().Regexps.join(","),
                    keyWord: getFilter().Keywords?.join(",") || "",
                    minBodySize: getFilter().MinBodySize,
                    maxBodySize: getFilter().MaxBodySize
                }}
                isHttps={isHttps}
                setIsHttps={setIsHttps}
                visible={advancedConfig}
                setVisible={setAdvancedConfig}
                onInsertYakFuzzer={onInsertYakFuzzer}
                onValuesChange={onGetFormValue}
            />
            <div className={styles["http-fuzzer-page"]}>
                <div className={styles["fuzzer-heard"]}>
                    {!advancedConfig && (
                        <div className={styles["display-flex"]}>
                            <span>高级配置</span>
                            <YakitSwitch checked={advancedConfig} onChange={setAdvancedConfig} />
                        </div>
                    )}
                    <div className={styles["fuzzer-heard-force"]}>
                        <span className={styles["fuzzer-heard-https"]}>强制 HTTPS</span>
                        <YakitCheckbox checked={isHttps} onChange={(e) => setIsHttps(e.target.checked)} />
                    </div>
                    <Divider type='vertical' style={{margin: 0, top: 1}} />
                    <div className={styles["display-flex"]}>
                        <ShareData module='fuzzer' getShareContent={getShareContent} />
                        <Divider type='vertical' style={{margin: "0 8px", top: 1}} />
                        <Popover
                            trigger={"click"}
                            placement={"leftTop"}
                            destroyTooltipOnHide={true}
                            content={
                                <div style={{width: 400}}>
                                    <HTTPFuzzerHistorySelector
                                        currentSelectId={currentSelectId}
                                        onSelect={(e, page) => {
                                            setCurrentPage(page)
                                            loadHistory(e)
                                        }}
                                    />
                                </div>
                            }
                        >
                            <YakitButton type='text' icon={<ClockIcon />} style={{padding: "4px 0px"}}>
                                历史
                            </YakitButton>
                        </Popover>
                    </div>

                    {loading ? (
                        <YakitButton
                            onClick={() => {
                                cancelCurrentHTTPFuzzer()
                            }}
                            className='button-primary-danger'
                            danger={true}
                            type={"primary"}
                        >
                            强制停止
                        </YakitButton>
                    ) : (
                        <YakitButton
                            onClick={() => {
                                resetResponse()

                                setRemoteValue(WEB_FUZZ_PROXY, `${proxy}`)
                                setRedirectedResponse(undefined)
                                sendFuzzerSettingInfo()
                                submitToHTTPFuzzer()
                                setCurrentPage(1)
                            }}
                            icon={<PaperAirplaneIcon style={{height: 16}} />}
                            type={"primary"}
                        >
                            发送数据包
                        </YakitButton>
                    )}
                    {loading && (
                        <div className={classNames(styles["spinning-text"], styles["display-flex"])}>
                            <YakitSpin size={"small"} style={{width: "auto"}} />
                            sending packets
                        </div>
                    )}

                    {onlyOneResponse && getFirstResponse().Ok && (
                        <YakitButton
                            onClick={() => {
                                setLoading(true)
                                ipcRenderer
                                    .invoke("RedirectRequest", {
                                        Request: request,
                                        Response: new Buffer(getFirstResponse().ResponseRaw).toString("utf8"),
                                        IsHttps: isHttps,
                                        PerRequestTimeoutSeconds: timeout,
                                        NoFixContentLength: noFixContentLength,
                                        Proxy: proxy
                                    })
                                    .then((rsp: FuzzerResponse) => {
                                        setRedirectedResponse(rsp)
                                    })
                                    .catch((e) => {
                                        failed(`"ERROR in: ${e}"`)
                                    })
                                    .finally(() => {
                                        setTimeout(() => setLoading(false), 300)
                                    })
                            }}
                            type='outline2'
                        >
                            跟随重定向
                        </YakitButton>
                    )}
                    <div className={styles["display-flex"]}>
                        {droppedCount > 0 && <YakitTag color='danger'>已丢弃[{droppedCount}]个响应</YakitTag>}
                        {proxy && (
                            <Tooltip title={proxy}>
                                <YakitTag className={classNames(styles["proxy-text"], "content-ellipsis")}>
                                    代理：{proxy}
                                </YakitTag>
                            </Tooltip>
                        )}
                        {actualHost && (
                            <YakitTag
                                color='danger'
                                className={classNames(styles["actualHost-text"], "content-ellipsis")}
                            >
                                请求 Host:{actualHost}
                            </YakitTag>
                        )}
                    </div>
                </div>
                {/*<Divider style={{marginTop: 6, marginBottom: 8, paddingTop: 0}}/>*/}
                <ResizeCardBox
                    firstMinSize={350}
                    secondMinSize={360}
                    style={{overflow: "hidden"}}
                    firstNodeProps={{
                        title: "Request",
                        extra: (
                            <div className={styles["fuzzer-firstNode-extra"]}>
                                <div className={styles["fuzzer-flipping-pages"]}>
                                    <ChevronLeftIcon
                                        className={classNames(styles["chevron-icon"], {
                                            [styles["chevron-icon-disable"]]: currentPage === 0 || currentPage === 1
                                        })}
                                        onClick={() => onPrePage()}
                                    />
                                    <span className={styles["fuzzer-flipping-pages-tip"]}>
                                        ID:{currentSelectId || "-"}
                                    </span>
                                    <ChevronRightIcon
                                        className={classNames(styles["chevron-icon"], {
                                            [styles["chevron-icon-disable"]]: currentPage == total
                                        })}
                                        onClick={() => onNextPage()}
                                    />
                                </div>
                                <PacketScanButton
                                    packetGetter={() => {
                                        return {httpRequest: StringToUint8Array(request), https: isHttps}
                                    }}
                                />
                                <YakitButton
                                    size='small'
                                    type='primary'
                                    onClick={() => {
                                        hotPatchTrigger()
                                    }}
                                >
                                    热加载
                                </YakitButton>
                                <Popover
                                    trigger={"click"}
                                    title={"从 URL 加载数据包"}
                                    content={
                                        <div style={{width: 400}}>
                                            <Form
                                                layout={"vertical"}
                                                onSubmitCapture={(e) => {
                                                    e.preventDefault()

                                                    ipcRenderer
                                                        .invoke("Codec", {
                                                            Type: "packet-from-url",
                                                            Text: targetUrl
                                                        })
                                                        .then((e) => {
                                                            if (e?.Result) {
                                                                setRequest(e.Result)
                                                                refreshRequest()
                                                            }
                                                        })
                                                        .finally(() => {})
                                                }}
                                                size={"small"}
                                            >
                                                <InputItem
                                                    label={"从 URL 构造请求"}
                                                    value={targetUrl}
                                                    setValue={setTargetUrl}
                                                    extraFormItemProps={{style: {marginBottom: 8}}}
                                                />
                                                <Form.Item style={{marginBottom: 8}}>
                                                    <Button type={"primary"} htmlType={"submit"}>
                                                        构造请求
                                                    </Button>
                                                </Form.Item>
                                            </Form>
                                        </div>
                                    }
                                >
                                    <YakitButton size={"small"} type={"primary"}>
                                        URL
                                    </YakitButton>
                                </Popover>
                            </div>
                        )
                    }}
                    secondNodeProps={{
                        title: "Responses",
                        extra: <div>fsdfdsf</div>
                    }}
                    firstNode={
                        <HTTPPacketEditor
                            system={props.system}
                            noHex={true}
                            noHeader={true}
                            refreshTrigger={refreshTrigger}
                            hideSearch={true}
                            bordered={true}
                            noMinimap={true}
                            utf8={true}
                            originValue={StringToUint8Array(request)}
                            actions={[
                                {
                                    id: "packet-from-url",
                                    label: "URL转数据包",
                                    contextMenuGroupId: "1_urlPacket",
                                    run: () => {
                                        setUrlPacketShow(true)
                                    }
                                },
                                {
                                    id: "copy-as-url",
                                    label: "复制为 URL",
                                    contextMenuGroupId: "1_urlPacket",
                                    run: () => {
                                        copyAsUrl({Request: getRequest(), IsHTTPS: getIsHttps()})
                                    }
                                },
                                {
                                    id: "insert-intruder-tag",
                                    label: "插入模糊测试字典标签",
                                    contextMenuGroupId: "1_urlPacket",
                                    run: (editor) => {
                                        showDictsAndSelect((i) => {
                                            monacoEditorWrite(editor, i, editor.getSelection())
                                        })
                                    }
                                },
                                {
                                    id: "insert-nullbyte",
                                    label: "插入空字节标签: {{hexd(00)}}",
                                    contextMenuGroupId: "1_urlPacket",
                                    run: (editor) => {
                                        editor.trigger("keyboard", "type", {text: "{{hexd(00)}}"})
                                    }
                                },
                                {
                                    id: "insert-hotpatch-tag",
                                    label: "插入热加载标签",
                                    contextMenuGroupId: "1_urlPacket",
                                    run: (editor) => {
                                        hotPatchTrigger()
                                    }
                                },
                                {
                                    id: "insert-fuzzfile-tag",
                                    label: "插入文件标签",
                                    contextMenuGroupId: "1_urlPacket",
                                    run: (editor) => {
                                        insertFileFuzzTag((i) => monacoEditorWrite(editor, i))
                                    }
                                },
                                {
                                    id: "insert-temporary-file-tag",
                                    label: "插入临时字典",
                                    contextMenuGroupId: "1_urlPacket",
                                    run: (editor) => {
                                        insertTemporaryFileFuzzTag((i) => monacoEditorWrite(editor, i))
                                    }
                                }
                            ]}
                            onEditor={setReqEditor}
                            onChange={(i) => setRequest(Uint8ArrayToString(i, "utf8"))}
                        />
                    }
                    secondNode={() => (
                        <AutoSpin spinning={false}>
                            {onlyOneResponse ? (
                                <>
                                    {redirectedResponse
                                        ? responseViewer(redirectedResponse)
                                        : responseViewer(getFirstResponse())}
                                </>
                            ) : (
                                <>
                                    {cachedTotal > 0 ? (
                                        <HTTPFuzzerResultsCard
                                            onSendToWebFuzzer={sendToFuzzer}
                                            sendToPlugin={sendToPlugin}
                                            setRequest={(r) => {
                                                setRequest(r)
                                                refreshRequest()
                                            }}
                                            extra={
                                                <Space>
                                                    <Button
                                                        size={"small"}
                                                        onClick={() => {
                                                            showExtractFuzzerResponseOperator(successFuzzer)
                                                        }}
                                                    >
                                                        提取响应数据
                                                    </Button>
                                                    <Popover
                                                        title={"导出数据"}
                                                        trigger={["click"]}
                                                        content={
                                                            <>
                                                                <Space>
                                                                    <Button
                                                                        size={"small"}
                                                                        type={"primary"}
                                                                        onClick={() => {
                                                                            exportHTTPFuzzerResponse(successFuzzer)
                                                                        }}
                                                                    >
                                                                        导出所有请求
                                                                    </Button>
                                                                    <Button
                                                                        size={"small"}
                                                                        type={"primary"}
                                                                        onClick={() => {
                                                                            exportPayloadResponse(successFuzzer)
                                                                        }}
                                                                    >
                                                                        仅导出 Payload
                                                                    </Button>
                                                                </Space>
                                                            </>
                                                        }
                                                    >
                                                        <Button size={"small"}>导出数据</Button>
                                                    </Popover>
                                                </Space>
                                            }
                                            failedResponses={failedFuzzer}
                                            successResponses={
                                                filterContent.length !== 0
                                                    ? filterContent
                                                    : keyword
                                                    ? []
                                                    : successFuzzer
                                            }
                                        />
                                    ) : (
                                        <Result
                                            status={"info"}
                                            title={"请在左边编辑并发送一个 HTTP 请求/模糊测试"}
                                            subTitle={
                                                "本栏结果针对模糊测试的多个 HTTP 请求结果展示做了优化，可以自动识别单个/多个请求的展示"
                                            }
                                        />
                                    )}
                                </>
                            )}
                        </AutoSpin>
                    )}
                />
                <Modal
                    visible={urlPacketShow}
                    title='从 URL 加载数据包'
                    onCancel={() => setUrlPacketShow(false)}
                    footer={null}
                >
                    <Form
                        layout={"vertical"}
                        onSubmitCapture={(e) => {
                            e.preventDefault()

                            ipcRenderer
                                .invoke("Codec", {
                                    Type: "packet-from-url",
                                    Text: targetUrl
                                })
                                .then((e) => {
                                    if (e?.Result) {
                                        setRequest(e.Result)
                                        refreshRequest()
                                        setUrlPacketShow(false)
                                    }
                                })
                                .finally(() => {})
                        }}
                        size={"small"}
                    >
                        <InputItem
                            label={"从 URL 构造请求"}
                            value={targetUrl}
                            setValue={setTargetUrl}
                            extraFormItemProps={{style: {marginBottom: 8}}}
                        ></InputItem>
                        <Form.Item style={{marginBottom: 8}}>
                            <Button type={"primary"} htmlType={"submit"}>
                                构造请求
                            </Button>
                        </Form.Item>
                    </Form>
                </Modal>
            </div>
        </div>
    )
}
interface AdvancedConfigValueProps {
    // 请求包配置
    forceFuzz?: boolean
    isHttps: boolean
    /**@name 不修复长度 */
    noFixContentLength: boolean
    actualHost: string
    timeout: number
    // 发包配置
    concurrent: number
    proxy: string[]
    minDelaySeconds: number
    maxDelaySeconds: number
    // 重试配置
    maxRetryTimes: number
    retryConfiguration?: {
        statusCode: string
        keyWord: string
    }
    noRetryConfiguration?: {
        statusCode: string
        keyWord: string
    }
    // 重定向配置
    redirectCount: number
    redirectConfiguration?: {
        statusCode: string
        keyWord: string
    }
    noRedirectConfiguration?: {
        statusCode: string
        keyWord: string
    }
    // 过滤配置
    filterMode: "drop" | "match"
    statusCode: string
    regexps: string
    keyWord: string
    minBodySize: number
    maxBodySize: number
}
interface HttpQueryAdvancedConfigProps {
    defAdvancedConfigValue: AdvancedConfigValueProps
    isHttps: boolean
    setIsHttps: (b: boolean) => void
    visible: boolean
    setVisible: (b: boolean) => void
    onInsertYakFuzzer: () => void
    onValuesChange: (v: AdvancedConfigValueProps) => void
}
const HttpQueryAdvancedConfig: React.FC<HttpQueryAdvancedConfigProps> = React.memo((props) => {
    const {defAdvancedConfigValue, isHttps, setIsHttps, visible, setVisible, onInsertYakFuzzer, onValuesChange} = props

    const [retrying, setRetrying] = useState<boolean>(true) // 重试条件
    const [noRetrying, setNoRetrying] = useState<boolean>(false)
    const [retryActive, setRetryActive] = useState<string[] | string>(["重试条件"])

    const [redirect, setRedirect] = useState<boolean>(true)
    const [noRedirect, setNoRedirect] = useState<boolean>(false)
    const [redirectActive, setRedirectActive] = useState<string[] | string>(["重定向条件"])
    const ruleContentRef = useRef<any>()
    const [form] = Form.useForm()
    useEffect(() => {
        form.setFieldsValue({isHttps: isHttps})
    }, [isHttps])
    useUpdateEffect(() => {
        const v = form.getFieldsValue()
        onSetValue(v)
    }, [retrying, noRetrying, redirect, noRedirect])
    const onSetValue = useMemoizedFn((allFields: AdvancedConfigValueProps) => {
        let newValue: AdvancedConfigValueProps = {...allFields}
        if (!retrying) {
            newValue.retryConfiguration = undefined
        }
        if (!noRetrying) {
            newValue.noRetryConfiguration = undefined
        }
        if (!redirect) {
            newValue.redirectConfiguration = undefined
        }
        if (!noRedirect) {
            newValue.noRedirectConfiguration = undefined
        }
        onValuesChange(newValue)
    })
    return (
        <div className={styles["http-query-advanced-config"]} style={{display: visible ? "" : "none"}}>
            <div className={styles["advanced-config-heard"]}>
                <span>高级配置</span>
                <YakitSwitch checked={visible} onChange={setVisible} />
            </div>
            <Form
                form={form}
                colon={false}
                onValuesChange={(changedFields, allFields) => onSetValue(allFields)}
                size='small'
                labelCol={{span: 10}}
                wrapperCol={{span: 14}}
                style={{overflowY: "auto"}}
                initialValues={{
                    ...defAdvancedConfigValue
                }}
            >
                <Collapse
                    defaultActiveKey={["请求包配置", "发包配置", "过滤配置"]}
                    ghost
                    expandIcon={(e) => (e.isActive ? <ChevronDownIcon /> : <ChevronRightIcon />)}
                >
                    <Panel
                        header='请求包配置'
                        key='请求包配置'
                        extra={
                            <YakitButton
                                type='text'
                                className='button-text-danger'
                                onClick={(e) => {
                                    e.stopPropagation()
                                    const restValue = {
                                        forceFuzz: true,
                                        isHttps: false,
                                        noFixContentLength: false,
                                        actualHost: "",
                                        timeout: 30
                                    }
                                    form.setFieldsValue({
                                        ...restValue
                                    })
                                    const v = form.getFieldsValue()
                                    onValuesChange({
                                        ...v,
                                        ...restValue
                                    })
                                }}
                            >
                                重置
                            </YakitButton>
                        }
                    >
                        <Form.Item label='Intruder'>
                            <YakitButton
                                size='small'
                                type='outline1'
                                onClick={() => onInsertYakFuzzer()}
                                icon={<PlusSmIcon className={styles["plus-sm-icon"]} />}
                            >
                                插入 yak.fuzz 语法
                            </YakitButton>
                        </Form.Item>
                        <Form.Item label='渲染 Fuzz' name='forceFuzz' valuePropName='checked'>
                            <YakitSwitch />
                        </Form.Item>
                        <Form.Item label='强制 HTTPS' name='isHttps' valuePropName='checked'>
                            <YakitSwitch onChange={setIsHttps} />
                        </Form.Item>
                        <Form.Item label='不修复长度' name='noFixContentLength' valuePropName='checked'>
                            <YakitSwitch />
                        </Form.Item>
                        <Form.Item label='请求 Host' name='actualHost'>
                            <YakitInput placeholder='请输入...' size='small' />
                        </Form.Item>
                        <Form.Item label='超时时长' name='timeout'>
                            <YakitInputNumber type='horizontal' size='small' />
                        </Form.Item>
                    </Panel>
                    <Panel
                        header='发包配置'
                        key='发包配置'
                        extra={
                            <YakitButton
                                type='text'
                                className='button-text-danger'
                                onClick={(e) => {
                                    e.stopPropagation()
                                    const restValue = {
                                        concurrent: 20,
                                        proxy: [],
                                        minDelaySeconds: undefined,
                                        maxDelaySeconds: undefined
                                    }
                                    form.setFieldsValue({
                                        ...restValue
                                    })
                                    const v = form.getFieldsValue()
                                    onValuesChange({
                                        ...v,
                                        ...restValue
                                    })
                                }}
                            >
                                重置
                            </YakitButton>
                        }
                    >
                        <Form.Item label='并发线程' name='concurrent'>
                            <YakitInputNumber type='horizontal' size='small' />
                        </Form.Item>
                        <Form.Item label='设置代理' name='proxy'>
                            <YakitSelect
                                options={[
                                    {
                                        label: "http://127.0.0.1:7890",
                                        value: "http://127.0.0.1:7890"
                                    },
                                    {
                                        label: "http://127.0.0.1:8080",
                                        value: "http://127.0.0.1:8080"
                                    },
                                    {
                                        label: "http://127.0.0.1:8082",
                                        value: "http://127.0.0.1:8082"
                                    }
                                ]}
                                placeholder='请输入...'
                                mode='tags'
                                size='small'
                                maxTagCount={1}
                            />
                        </Form.Item>
                        <Form.Item label='随机延迟'>
                            <div className={styles["advanced-config-delay"]}>
                                <Form.Item
                                    name='minDelaySeconds'
                                    noStyle
                                    normalize={(value) => {
                                        return value.replace(/\D/g, "")
                                    }}
                                >
                                    <YakitInput
                                        prefix='Min'
                                        suffix='s'
                                        size='small'
                                        className={styles["delay-input-left"]}
                                    />
                                </Form.Item>
                                <Form.Item
                                    name='maxDelaySeconds'
                                    noStyle
                                    normalize={(value) => {
                                        return value.replace(/\D/g, "")
                                    }}
                                >
                                    <YakitInput
                                        prefix='Max'
                                        suffix='s'
                                        size='small'
                                        className={styles["delay-input-right"]}
                                    />
                                </Form.Item>
                            </div>
                        </Form.Item>
                    </Panel>
                    {/* 以下重试配置、重定向配置，后期再调试 */}
                    {/* <Panel
                        header='重试配置'
                        key='重试配置'
                        extra={
                            <YakitButton
                                type='text'
                                className='button-text-danger'
                                onClick={(e) => {
                                    e.stopPropagation()
                                    const restValue = {
                                        maxRetryTimes: 3,
                                        retryConfiguration: {
                                            statusCode: undefined,
                                            keyWord: undefined
                                        },
                                        noRetryConfiguration: {
                                            statusCode: undefined,
                                            keyWord: undefined
                                        }
                                    }
                                    form.setFieldsValue({
                                        ...restValue
                                    })
                                    const v = form.getFieldsValue()
                                    onValuesChange({
                                        ...v,
                                        ...restValue
                                    })
                                }}
                            >
                                重置
                            </YakitButton>
                        }
                    >
                        <Form.Item label='重试次数' name='maxRetryTimes'>
                            <YakitInputNumber type='horizontal' size='small' />
                        </Form.Item>
                        <Collapse ghost activeKey={retryActive} onChange={(e) => setRetryActive(e)}>
                            <Panel
                                header={
                                    <span className={styles["display-flex"]}>
                                        <YakitCheckbox
                                            checked={retrying}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                            }}
                                            onChange={(e) => {
                                                const {checked} = e.target
                                                setRetrying(checked)
                                            }}
                                        />
                                        <span style={{marginLeft: 6}}>重试条件</span>
                                    </span>
                                }
                                key='重试条件'
                                style={{borderBottom: 0}}
                            >
                                <Form.Item label='状态码' name={["retryConfiguration", "statusCode"]}>
                                    <YakitInput placeholder='200,300-399' size='small' disabled={!retrying} />
                                </Form.Item>
                                <Form.Item label='关键字' name={["retryConfiguration", "keyWord"]}>
                                    <YakitInput placeholder='200,300-399' size='small' disabled={!retrying} />
                                </Form.Item>
                            </Panel>
                            <Panel
                                header={
                                    <span className={styles["display-flex"]}>
                                        <YakitCheckbox
                                            checked={noRetrying}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                            }}
                                            onChange={(e) => {
                                                setNoRetrying(e.target.checked)
                                            }}
                                        />
                                        <span style={{marginLeft: 6}}>不重试条件</span>
                                    </span>
                                }
                                key='不重试条件'
                                style={{borderBottom: 0}}
                            >
                                <Form.Item label='状态码' name={["noRetryConfiguration", "statusCode"]}>
                                    <YakitInput placeholder='200,300-399' size='small' disabled={!noRetrying} />
                                </Form.Item>
                                <Form.Item label='关键字' name={["noRetryConfiguration", "keyWord"]}>
                                    <YakitInput placeholder='Login,登录成功' size='small' disabled={!noRetrying} />
                                </Form.Item>
                            </Panel>
                        </Collapse>
                    </Panel>
                    <Panel
                        header='重定向配置'
                        key='重定向配置'
                        extra={
                            <YakitButton
                                type='text'
                                className='button-text-danger'
                                onClick={(e) => {
                                    e.stopPropagation()
                                    const restValue = {
                                        redirectCount: 3,
                                        redirectConfiguration: {
                                            statusCode: undefined,
                                            keyWord: undefined
                                        },
                                        noRedirectConfiguration: {
                                            statusCode: undefined,
                                            keyWord: undefined
                                        }
                                    }
                                    form.setFieldsValue({
                                        ...restValue
                                    })
                                    const v = form.getFieldsValue()
                                    onValuesChange({
                                        ...v,
                                        ...restValue
                                    })
                                }}
                            >
                                重置
                            </YakitButton>
                        }
                    >
                        <Form.Item label='重定向次数' name='redirectCount'>
                            <YakitInputNumber type='horizontal' size='small' />
                        </Form.Item>
                        <Collapse ghost activeKey={redirectActive} onChange={(e) => setRedirectActive(e)}>
                            <Panel
                                header={
                                    <span className={styles["display-flex"]}>
                                        <YakitCheckbox
                                            checked={redirect}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                            }}
                                            onChange={(e) => {
                                                setRedirect(e.target.checked)
                                            }}
                                        />
                                        <span style={{marginLeft: 6}}>重定向条件</span>
                                    </span>
                                }
                                key='重定向条件'
                                style={{borderBottom: 0}}
                            >
                                <Form.Item label='状态码' name={["redirectConfiguration", "statusCode"]}>
                                    <YakitInput placeholder='200,300-399' size='small' disabled={!redirect} />
                                </Form.Item>
                                <Form.Item label='关键字' name={["redirectConfiguration", "keyWord"]}>
                                    <YakitInput placeholder='200,300-399' size='small' disabled={!redirect} />
                                </Form.Item>
                            </Panel>
                            <Panel
                                header={
                                    <span className={styles["display-flex"]}>
                                        <YakitCheckbox
                                            checked={noRedirect}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                            }}
                                            onChange={(e) => {
                                                setNoRedirect(e.target.checked)
                                            }}
                                        />
                                        <span style={{marginLeft: 6}}>不重定向条件</span>
                                    </span>
                                }
                                key='不重定向条件'
                                style={{borderBottom: 0}}
                            >
                                <Form.Item label='状态码' name={["noRedirectConfiguration", "statusCode"]}>
                                    <YakitInput placeholder='200,300-399' size='small' disabled={!noRedirect} />
                                </Form.Item>
                                <Form.Item label='关键字' name={["noRedirectConfiguration", "keyWord"]}>
                                    <YakitInput placeholder='Login,登录成功' size='small' disabled={!noRedirect} />
                                </Form.Item>
                            </Panel>
                        </Collapse>
                    </Panel> */}
                    <Panel
                        header='过滤配置'
                        key='过滤配置'
                        extra={
                            <YakitButton
                                type='text'
                                className='button-text-danger'
                                onClick={(e) => {
                                    e.stopPropagation()
                                    const restValue = {
                                        filterMode: "drop",
                                        statusCode: "",
                                        Regexps: "",
                                        keyWord: "",
                                        MinBodySize: undefined,
                                        MaxBodySize: undefined
                                    }
                                    form.setFieldsValue({
                                        ...restValue
                                    })
                                    ruleContentRef?.current?.onSetValue("")
                                    const v = form.getFieldsValue()
                                    onValuesChange({
                                        ...v,
                                        ...restValue
                                    })
                                }}
                            >
                                重置
                            </YakitButton>
                        }
                    >
                        <Form.Item label='过滤器模式' name='filterMode'>
                            <YakitRadioButtons
                                buttonStyle='solid'
                                options={[
                                    {
                                        value: "drop",
                                        label: "丢弃"
                                    },
                                    {
                                        value: "match",
                                        label: "保留"
                                    }
                                ]}
                            />
                        </Form.Item>
                        <Form.Item label='状态码' name='statusCode'>
                            <YakitInput placeholder='200,300-399' size='small' />
                        </Form.Item>
                        <Form.Item label='正则' name='Regexps'>
                            <RuleContent
                                ref={ruleContentRef}
                                getRule={(val) => {
                                    form.setFieldsValue({
                                        Regexps: val
                                    })
                                }}
                                inputProps={{
                                    size: "small"
                                }}
                            />
                        </Form.Item>
                        <Form.Item label='关键字' name='keyWord'>
                            <YakitInput placeholder='Login,登录成功' size='small' />
                        </Form.Item>
                        <Form.Item label='响应大小'>
                            <div className={styles["advanced-config-delay"]}>
                                <Form.Item
                                    name='MinBodySize'
                                    noStyle
                                    normalize={(value) => {
                                        return value.replace(/\D/g, "")
                                    }}
                                >
                                    <YakitInput
                                        prefix='Min'
                                        suffix='s'
                                        size='small'
                                        className={styles["delay-input-left"]}
                                    />
                                </Form.Item>
                                <Form.Item
                                    name='MaxBodySize'
                                    noStyle
                                    normalize={(value) => {
                                        return value.replace(/\D/g, "")
                                    }}
                                >
                                    <YakitInput
                                        prefix='Max'
                                        suffix='s'
                                        size='small'
                                        className={styles["delay-input-right"]}
                                    />
                                </Form.Item>
                            </div>
                        </Form.Item>
                    </Panel>
                </Collapse>
            </Form>
        </div>
    )
})

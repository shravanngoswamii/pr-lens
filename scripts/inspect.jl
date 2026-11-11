module ReviewFacts

using InteractiveUtils
using TOML

function method_record(method::Method)
    file, line = Base.functionloc(method)
    return Dict("signature" => string(method.sig), "module" => string(method.module),
        "file" => string(file), "line" => line)
end

function inspect_methods(f, types=nothing)
    selected = isnothing(types) ? methods(f) : methods(f, types)
    isempty(selected) && error("No matching methods")
    return Dict("kind" => "methods", "subject" => string(f),
        "methods" => method_record.(collect(selected)))
end

function inspect_type(T::Type)
    inner = Base.unwrap_unionall(T)
    inner isa DataType || error("Use a named type, not a union")
    fields = isabstracttype(inner) ? [] : [Dict("name" => string(name), "type" => string(type))
        for (name, type) in zip(fieldnames(inner), fieldtypes(inner))]
    return Dict("kind" => "type", "subject" => string(T), "supertype" => string(supertype(T)),
        "fields" => fields, "loaded_subtypes" => string.(subtypes(T)))
end

function inspect_body(f, types::Type{<:Tuple}; mode=:lowered)
    mode in (:lowered, :typed) || error("Use lowered or typed")
    bodies = mode === :lowered ? code_lowered(f, types) : code_typed(f, types; optimize=false)
    isempty(bodies) && error("No matching bodies")
    return Dict("kind" => string(mode), "subject" => string(f), "input_types" => string(types),
        "optimized" => false, "bodies" => [sprint(show, MIME"text/plain"(), body) for body in bodies],
        "scope" => "Compiler representation for these input types. No runtime calls were observed.")
end

function main(args)
    usage = "Usage: inspect.jl methods|type|lowered|typed EXPR [--types 'Tuple{Int}'] [--setup probe.jl]"
    length(args) >= 2 || error(usage)
    command, expression = args[1:2]
    command in ("methods", "type", "lowered", "typed") || error(usage)
    options = Dict{String,String}()
    rest = args[3:end]
    iseven(length(rest)) || error(usage)
    for i in 1:2:length(rest)
        rest[i] in ("--types", "--setup") || error("Unknown option $(rest[i])")
        haskey(options, rest[i]) && error("Duplicate option $(rest[i])")
        options[rest[i]] = rest[i+1]
    end
    haskey(options, "--setup") && Base.include(Main, abspath(options["--setup"]))
    subject = Core.eval(Main, Meta.parse(expression))
    types = haskey(options, "--types") ? Core.eval(Main, Meta.parse(options["--types"])) : nothing
    !isnothing(types) && !(types isa Type{<:Tuple}) && error("--types must be a Tuple type")
    result = if command == "methods"
        inspect_methods(subject, types)
    elseif command == "type"
        isnothing(types) || error("type does not accept --types")
        inspect_type(subject)
    else
        isnothing(types) && error("$command requires --types with concrete example types")
        isconcretetype(types) || error("Body inspection requires concrete input types")
        inspect_body(subject, types; mode=Symbol(command))
    end
    result["julia_version"] = string(VERSION)
    result["project"] = something(Base.active_project(), "none")
    TOML.print(stdout, result; sorted=true)
end

end

if abspath(PROGRAM_FILE) == @__FILE__
    try
        ReviewFacts.main(ARGS)
    catch err
        println(stderr, "reviary: ", sprint(showerror, err))
        exit(1)
    end
end
